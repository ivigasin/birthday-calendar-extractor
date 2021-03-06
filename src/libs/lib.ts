import { DateTime } from 'luxon';
import {
  forkJoin,
  Observable,
  of,
} from 'rxjs';
import { ajax } from 'rxjs/ajax';
import {
  map,
  mapTo,
  switchMap,
} from 'rxjs/operators';
import { Action } from '../constants';
import {
  languages,
  LanguageSet,
} from './languages';

export interface RawEvent {
  uid?: string; // User Id, unique id generated from facebook page url
  name: string;
  month: number;
  day: number;
  href: string;
  ignored: boolean;
  changeTime?: number;
}

export interface BakedEvent {
  uid: string;
  name: string;
  start: DateTime;
  end: DateTime;
  href: string;
}

export function bakeEvent(event: RawEvent, year: number): BakedEvent {
  // Take care of leap year
  // Since all coming birthdays are from 2020 (leap year) 02/29 can occur
  // So in order to prevent the error, I create the date from 2020 and change the year later
  // luxon knows to handle this and change 29 to 28 if needed
  const start = DateTime.utc(2020, event.month, event.day).set({year: year});

  // Wrong date
  if (!start.isValid) {
    return null;
  }

  return {
    name: event.name,
    start: start,
    end: start.plus({days: 1}),
    href: event.href,
    uid: window.btoa(event.href),
  };
}

export function weekDates(): { [name: number]: DateTime } {
  const days: { [name: number]: DateTime } = {};

  for (let i = 1; i <= 7; i++) {
    const date = DateTime.utc().plus({days: i});
    const weekDayNumber = +date.toFormat('c') - 1; // toFormat('c') returns weekday from 1-7 (Monday is 1, Sunday is 7)
    days[weekDayNumber] = date;
  }
  return days;
}

export function getLanguagesList() {
  return languages.flatMap(l => l.languages);
}

export function findLanguageSetByLanguage(language: string): LanguageSet {
  return languages.find((data) => -1 !== data.languages.findIndex(l => l === language));
}

function extractCardWithDate(src: string, patterns: Array<RegExp>): { name: string, day: number, month: number } {
  let result: RegExpMatchArray;

  patterns.find((p) => {
    result = src.match(p);
    return result;
  });

  if (!result) {
    return;
  }

  return {
    name: result.groups.name,
    day: +result.groups.day,
    month: +result.groups.month,
  };
}

function weekDayNumberByName(languageSet: LanguageSet, weekDayName: string) {
  return languageSet.weekdays.findIndex(w => w === weekDayName);
}

function extractCardWithWeek(src: string, pattern: RegExp, languageSet: LanguageSet): { name: string, day: number, month: number } {
  // Parse as weekday for each pattern
  const result = src.match(pattern);

  if (!result) {
    return;
  }

  // find week day number by the name
  const weekDayNumber = weekDayNumberByName(languageSet, result.groups.weekDayName);

  if (-1 === weekDayNumber) {
    return;
  }
  const weekDay = weekDates()[weekDayNumber];
  return {
    name: result.groups.name,
    day: +weekDay.day,
    month: +weekDay.month,
  };
}

function generateRawEvents(data: Array<{ href: string; user: string }>, languageSet: LanguageSet): Array<RawEvent> {
  return data.map(item => {
    const card = extractCardWithDate(item.user, languageSet.pattern) ||
      extractCardWithWeek(item.user, languageSet.weekdays_pattern, languageSet);

    if (card && item.href.length) {
      return Object.assign(card, {
        ignored: false,
        changeTime: 0,
        href: item.href,
        uid: window.btoa(item.href),
      });
    }
  });
}

export function decode(str: string) {
  return (str + '')
    .replace(/&#x[0-9a-f]+;/gm, (s) => {
      return String.fromCharCode(parseInt(s.match(/[0-9a-f]+/gm)[0], 16));
    });
}

function extractBirthdayDataFromHtml(rawData: string): Array<{ href: string, user: string }> {
  rawData = decode(rawData);
  const regex = new RegExp('<a href="([^"]*)"[^>]+?data-tooltip-content="([^"]*)"', 'gm');
  let m: RegExpExecArray;
  const result = [];
  // tslint:disable-next-line:no-conditional-assignment
  while ((m = regex.exec(rawData)) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (m.index === regex.lastIndex) {
      regex.lastIndex++;
    }

    result.push({
      href: m[1],
      user: m[2],
    });
  }
  return result;
}

function loopDates() {
  /**
   * Request dates are mess
   * To fetch monthly birthdays Facebook uses timestamp with 1rst day of the month
   * Though time used is different from month to month,
   * i.e Dec, Jan, Feb, Mar use 8:00
   * rest of the month use 7:00
   *
   * Additionally when requesting 1 March, 8:00 - no 31 of March birthdays appear,
   * they can be found when requesting 1 April 6:00 !!!
   *
   * So to make sure I fetch all the birthdays I'll make two requests per month.
   */
  return Array(12)
    .fill([8, 7])
    .fill([7, 6], 3, 10)
    .map((v, k) => [
        DateTime.utc(2020, k + 1, 1, v[0]).toSeconds(),
        DateTime.utc(2020, k + 1, 1, v[1]).toSeconds(),
      ],
    ).flat();
}

/**
 * Parse provided html page and extract language from structures as
 * ["LocaleInitialData",[],{"locale":"en_US","language":"English (US)"},273]
 */
function extractLanguageFromPage(page: string): string {
  const pattern = new RegExp('."language":"(.*?)"', 'm');
  const result = pattern.exec(page);
  return result && result[1];
}

/**
 * Parse provided html page and extract async_get_token
 */
function extractTokenFromPage(page: string): string {
  const pattern = new RegExp('.*async_get_token":"(.*?)"', 'm');
  const result = pattern.exec(page);
  return result && result[1];
}

/**
 * Make request to facebook.com in order to receive html with vital information such as
 * async_get_token and used language
 *
 * return {language, token}
 */
export function parsePageForConfig() {
  return ajax({
    url: 'https://www.facebook.com',
    headers: {
      'accept': 'text/html',
    },
    responseType: 'text',
  })
    .pipe(
      map(data => data.response),
      map(page => ({token: extractTokenFromPage(page), language: extractLanguageFromPage(page)})),
    );
}

function fetchBirthdaysPage(url: string): Observable<string> {
  return ajax({url, responseType: 'text'})
    .pipe(
      map(r => JSON.parse(r.response.substring(9))),
      map(r => r.domops[0][3].__html),
    );
}

export function storageKeyName() {
  return chrome.i18n.getMessage('STORAGE_KEY_NAME');
}

export function sendMessage(action: Action, callback?: (response: any) => void) {
  return chrome.runtime.sendMessage(action, callback);
}

/**
 * Fetch data from sessionStorage
 * Made it Observable to easy fit chrome.storage functionality
 */
export function retrieveBirthdays(): Observable<Map<string, RawEvent>> {
  try {
    const items: Array<[string, RawEvent]> =
      (JSON.parse(sessionStorage.getItem(storageKeyName())) as Array<RawEvent>)
        .map(i => [i.uid, i]);
    return of(new Map(items));
  } catch (e) {
    return of(null);
  }
}

/**
 * Store data to sessionStorage
 * Made it Observable to easy fit chrome.storage functionality
 */
export function storeBirthdays(events: Map<string, RawEvent>): Observable<null> {
  const asArray = Array.from(events.values());
  sessionStorage.setItem(storageKeyName(), JSON.stringify(asArray));
  return of(null);
}

export function fetchBirthdays(token: string, language: string): Observable<Map<string, RawEvent>> {
  const languageSet = findLanguageSetByLanguage(language);

  const requests = loopDates()
    .map(date => 'https://www.facebook.com/async/birthdays/?date=' + date + '&__a=1&fb_dtsg_ag=' + token)
    .map(fetchBirthdaysPage);

  return forkJoin(requests)
    .pipe(
      map(
        responses => {
          const nonUniques: Array<[string, RawEvent]> = responses
            .map(extractBirthdayDataFromHtml)
            .map(items => generateRawEvents(items, languageSet))
            .flat()
            .map(i => [i.uid, i]);

          return new Map(nonUniques); // All non-uniques are removed
        }),
    );
}

export function getBirthdaysList(language: string, token: string): Observable<Map<string, RawEvent>> {
  return retrieveBirthdays()
    .pipe(
      switchMap(items => {
        if (items) {
          return of(items);
        }
        // Make full run for the data
        return fetchBirthdays(token, language)
          .pipe(
            switchMap(r => storeBirthdays(r).pipe(mapTo(r))),
          );
      }),
    );
}
