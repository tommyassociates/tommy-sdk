# Tommy SDK

The Tommy SDK enables developers to build custom mini programs and integrations that extend Tommy's functionality.

The SDK itself emulates the live Tommy environment, so you can develop mini programs on your local machine that will integrate seamlessly with the live app.

Tommy is working with a limited number of Alpha testing developers before the SDK will be made available to Partners.

To get started building Tommy Mini Programs read the [Developers Guide](http://docs.mytommy.com/).

© Copyright 2020-2021 Tommy Associates Pty Ltd. All rights reserved.

### Host route navigation

`tommy.navigation.open(path, opts?)` navigates forward on the visible MP host
view's router (or the main router when no MP view is visible).
`tommy.navigation.back(fallbackPath?, opts?)` returns with backward animation.
With a previous page it pops history; when the requested fallback differs from
that previous URL, or no previous page exists, it calls
`router.back(fallbackPath, { ...opts, force: true })`. With neither history nor a
fallback it does nothing and returns `{ back: false }`.

Both methods defer while a page transition is in progress. `back` returns
`{ back: true }`, or `{ back: true, deferred: true }` when queued. Options are
Framework7 router options. Navigation requires no additional manifest scope.
Use `back('/forms/')` for a return control and `open('/forms/')` for a new visit.
