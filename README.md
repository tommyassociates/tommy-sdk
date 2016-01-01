# Tommy Extension SDK

The Tommy Extension SDK enables developers to build custom extensions and integrations that extend Tommy's core functionality.

The SDK itself emulates the live Tommy environment, so you can develop extensions on your local machine that will integrate seamlessly with the live deployment.

## Getting Started

Install the SDK by typing:

```
npm install tommy_extension_sdk
```

Open up the `APIKEY` file in the `tommy_extension_sdk` folder and paste in your Tommy API Key.

Now launch the server emulator:

```
node server
```

To load the emulator point your browser at http://localhost:4000

## Building Extensions

When you first load the emulator you will notice there are a couple of demo extensions available in the menu. The source code for these demo extensions is located in the `/extensions` folder, and they are a good place to start when building your own extensions.

The basic folder structure is extremely simple:

~~~
extensions/{your_extension_name}
.
|-- manifest.json
|-- main.html
~~~

### Manifest File

Each extension package contains a single `manifest.json` file. The `manifest.json` file contains all the metadata information, configuration options, and a list of views to be exposed by your extension.

A minimal `manifest.json` file with both `client` and `admin` views would look like something like this:

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

The `manifest.json` options are as follows:

* **name**: (String) The human readable name of the extension.
* **package**: (String) The machine readable name of the extension in underscore case.
* **version**: (String) The release version number (must be incremented on each release).
* **author**: (String) The extensions author name (may be individual or organisation).
* **private**: (Boolean) The privacy setting that determines if this extension is usable by other Tommy users or not.
* **views**: (Object) The object containing the views to be exposed on the interface.

#### Views

Each extension may contain multiple views to be exposed on the interface. Views are defined within the `views` option in the `manifest.json` file.

* **name**: (String) The view page title.
* **file**: (String) The relative view path to the view HTML file ie. `client/main.html`.
* **type**: (String) The view type, current supported are `page` and `form`.
* **scope**: (String) The view type, current supported are `client` and `admin`.
* **framed**: (Boolean) Weather or not the view should be loaded inside an iframe.
* **permissions**: (Object) The view permission object.

Special care should be taken when defining the view application scope, which has two options; `client`, and `admin`. Views with the `client` scope will be exposed within the client side mobile app used by employees, and views with the `admin` scope will be exposed within the backend app used by employers.

If you want your view to be framed inside an `iframe`, you can do so by specifying the `framed: true` option. This is good for securing your view data, but be aware that since your view will be running in a sandboxed environment, none of the Tommy environment, API instance, or CSS styles will be available for use.
