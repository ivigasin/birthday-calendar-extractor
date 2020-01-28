## ![Birthday Calendar Extractor for Facebook](public/icons/icon.48.png) [Birthday Calendar Extractor for Facebook](https://chrome.google.com/webstore/detail/birthday-calendar-extract/imielmggcccenhgncmpjlehemlinhjjo)

This extension helps to create calendar with all your facebook friends birthdays for a next two years.

Generated calendar file saved in `ICS` format - a universal calendar format used by several email and calendar programs, including Microsoft Outlook, Google Calendar, and Apple Calendar.

### Important!
**There is no easy way to remove birthday events from the calendar later!**

At your calendar I suggest to create a new Birthday themed sub-calendar and use it for imports. 

### How to use
Just click extension icon, popups will guide you through step-by-step. Each click on the icon will bring you closer :)

At the end of the process file named `birthday-calendar.ics` will be downloaded automatically to your Downloads folder.

Use generated file to export your friends' birthdays to your calendar program.

### Changelog
1.0.1
- Fixed typos

1.0.0
- All the functionality moved to browser action
- Bug Fix: When Facebook interface was set to 'English (UK)' calendar generated wrong dates.
- Supported facebook languages: English (UK), English (US), Русский, Українська, עברית

### Things to improve
It is open source, feel free to check it here: https://github.com/zagushka/birthday-calendar-extractor
* Option to edit birthdays before generating the calendar file.
* Leap years February 29 birthdays.
* Get rid of [luxon](https://moment.github.io/luxon/) to reduce bundle size.
* Direct export to Google Calendar.

