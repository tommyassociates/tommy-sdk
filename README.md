# Tommy Addon SDK

The Tommy Addon SDK enables developers to build custom addons and integrations that extend Tommy's core functionality.

The SDK itself emulates the live Tommy environment, so you can develop addons on your local machine that will integrate seamlessly with the live deployment.

## Getting Started

Install the SDK by typing:

```
npm install tommy_addon_sdk
```

Open up the `APIKEY` file in the `tommy_addon_sdk` folder and paste in your Tommy API Key.

Now launch the server emulator:

```
node server
```

To load the emulator point your browser at http://localhost:4000

## Building Addons

When you first load the emulator you will notice there are a couple of demo addons available in the menu. The source code for these demo addons is located in the `/addons` folder, and they are a good place to start when building your own addons.

The basic folder structure is extremely simple:

~~~
addons/{your_addon_name}
.
├── schema.yml
├── icon.png
└── views
    └── main.html
~~~

### Schema File

Each addon package contains a single `schema.yml` file. The `schema.yml` file contains all the metadata information, configuration options, and a list of views and actions to be exposed by your addon.

A minimal `schema.yml` file with both `client` and `admin` views would look like something like this:

```
{
  "name": "Hello World",
  "package": "hello",
  "version": "0.0.1",
  "author": "Kam Low",
  "private": false,

  "views": [
    {
      "name": "Hello World",
      "file": "client/main.html",
      "type": "page",
      "scope": "client",
      "framed": false,
      "permissions": {}
    },
    {
      "name": "Hello World Admin",
      "file": "admin/form.html",
      "type": "form",
      "scope": "admin",
      "framed": false,
      "permissions": {}
    }
  ]
}
```

The `schema.yml` options are as follows:

* **name**: (String) The human readable name of the addon.
* **package**: (String) The machine readable name of the addon in underscore case.
* **version**: (String) The release version number (must be incremented on each release).
* **author**: (String) The addons author name (may be individual or organisation).
* **private**: (Boolean) The privacy setting that determines if this addon is usable by other Tommy users or not.
* **views**: (Object) The object containing the views to be exposed on the interface.

#### Views

Each addon may contain multiple views to be exposed on the interface. Views are defined within the `views` option in the `schema.yml` file.

* **name**: (String) The view page title.
* **file**: (String) The relative view path to the view HTML file ie. `client/main.html`.
* **type**: (String) The view type, current supported are `page` and `form`.
* **scope**: (String) The view type, current supported are `client` and `admin`.
* **framed**: (Boolean) Weather or not the view should be loaded inside an iframe.
* **permissions**: (Object) The view permission object.

Special care should be taken when defining the view application scope, which has two options; `client`, and `admin`. Views with the `client` scope will be exposed within the client side mobile app used by employees, and views with the `admin` scope will be exposed within the backend app used by employers.

If you want your view to be framed inside an `iframe`, you can do so by specifying the `framed: true` option. This is good for securing your view data, but be aware that since your view will be running in a sandboxed environment, none of the Tommy environment, API instance, or CSS styles will be available for use.

## Understanding Actions

Each Addon may define a number of Actions, that can be used to run dynamic code and perform arbitrary tasks that update the interface in real time. Imagine it like an IFTTT system with the following structure:

* **Tasks**: Tasks run a block of code at specified intervals and fire a `Trigger` when data is available or an internal condition is met. The code executed by tasks is completely implementation independent, but the data output by the script must be in a format that Tommy understands so the Actions system can execute the correct `Trigger`.

* **Triggers**: Triggers are executed by a `Task` and passed into the Actions system to be processed by an `Activity`.

* **Activities**: Activities handle `Trigger` data and do something with it. This may include sending an email, notifying a user, or just about anything you could imagine with internal or external APIs.

## Building Actions

The best way to start building an action is to reverse engineer what's already been built. Take for example the `poke` addon.

...

## Using The SDK

The SDK works as an emulator for the Tommy mobile phone app.

<!-- It uses Framework7 for the interface. -->

When you open the emulator interface you will see a list of addons that are available on the local file system in the `addons` directory.

Beside each addon on the interface there is a settings button that will bring up a list of actions that are available for testing and deploying your addon.

### Getting Started

While developing your addons you can work from the local file system, and when you are ready to test the addon on a live environment.

Phase

#### Local Development

The local testing phase lets you build and preview your addon interface locally before uploading anything.

To preview your addon just select the addon from the main emulator view.

**Note**: If you're building an addon for the purpose of creating actions then you will need to install the addon on the sandbox server before you can test your actions. See (#sandbox-testing)[Sandbox Testing Phase].

#### Sandbox Testing

The sandbox testing phase lets you test your addon on a live environment before you submit your final addon to Tommy.

You can instll your addon on the sandbox server at any time by selecting the addon from the main emulator view and clicking "Install on Sandbox"

To access your addon open the Tommy App and change to your Developer account from the account toggle. While your Developer account is active you will be able to configure and use all the actions you have installed on the sandbox account. Cool huh?

#### Submit Addon

Once your addon is fully tested you can submit it to Tommy for review. If accepted your addon will be installed on the live system and you will be able to install it from the Tommy Store.
