# Timesheets

This addon lists employee timesheets and provides managers with the ability to approve or deny timesheets.

# API

Three main objects are used:

* **Schedule**: The schedule object that contains multiple employee shifts or events for a period of time (weekly or monthly). Schedules can be approved or rejected by managers.
* **Event**: The event object signifies the shift or event to be attended by an employee. Events have a start and end time and custom metadata.
* **Attendance**: The proof of attendance of the shift or event. This object contains a picture and geolocation metadata.
