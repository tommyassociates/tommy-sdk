# Tommy Developers Guide

Welcome, Tommy developer! This purpose of this document is to get you setup with the Tommy SDK, and walk you through the process of creating your first Tommy addon. Woof!


## Obtain your API key

Please contact developers@mytommy.com in order to obtain your API key.


## Understanding the SDK

The Tommy Addon SDK works as a sandboxed emulator for the the Tommy app environment, enabling you to develop addons on your local machine in realtime that will integrate seamlessly with the live Tommy app.

### Installing the SDK

Install the SDK by typing:

```
npm install tommy_addon_sdk
```

<!-- Open up the `config.json` file in the `tommy_addon_sdk` folder and paste in your Tommy API Key. -->
Create a file called `config.json` file in the `tommy_addon_sdk` folder and paste in the following contents, including your API key:

```
{
  "apiKey" : "<YOUR API KEY>",
  "apiEndpoint" : "https://api.mytommy.com",
  "apiSandboxEndpoint" : "https://api.mytommy.com"
}
```

Now launch the SDK server:

```
node sdk
```

To load the SDK interface point your browser to http://localhost:4000

### Using the SDK

<!--
The SDK works as an emulator for the Tommy mobile app.
It uses Framework7 for the interface. -->

<!-- When you open the emulator interface you will see a list of addons that are available on the local file system in the `addons` directory. These addons are provided as examples so you can reverse engineer the code for your own purposes. -->

When you first load the emulator you will notice there are some demo addons available in the menu. The source code for these demo addons is located in the `/addons` folder, and they are a good place to start when building your own addons.

Underneath the `Views` heading you will see a number of addon views that can be opened. If you click on any view you will be able to see that view emulated inside the browser. If you modify any of the code from the relative addon, then that view will be automatically reloaded and you can see your changes in real time.

Using the SDK itself is very straight forward, so lets move on to an exaplanation of the addon file structure and manifest files.

<!-- Beside each addon on the interface there is a settings button that will bring up a list of actions that are available for testing and deploying your addon. -->

<!-- ### Getting Started

While developing your addons you can work from the local file system, and when you are ready to test the addon on a live environment.

#### Local Development

The local testing phase lets you build and preview your addon interface locally before uploading anything.

To preview your addon just select the addon from the main emulator view.

**Note**: If you're building an addon for the purpose of creating actions then you will need to install the addon on the sandbox server before you can test your actions. See (#sandbox-testing)[Sandbox Testing Phase].

#### Sandbox Testing

The sandbox testing phase lets you test your addon on a live environment before you submit your final addon to Tommy.

You can install your addon on the sandbox server at any time by selecting the addon from the main emulator view and clicking "Install on Sandbox"

To access your addon open the Tommy app and change to your Developer account from the account toggle. While your Developer account is active you will be able to configure and use all the actions you have installed on the sandbox account. Cool huh?

#### Submit Addon

Once your addon is fully tested you can submit it to Tommy for review. If accepted your addon will be installed on the live system and you will be able to install it from the Tommy Store. -->


## Building Addons

Addons enable you extend Tommy's core functionality in almost any way. This flexibility is one of the key features of the Tommy platform.

There are two main addon types that can be used for different purposes:

1. *Visial addon*: Addons which integrate with and extend the Tommy app interface
2. *Non-visial addon*: Addons which integrate with the [Tommy Action System](#understanding-the-actions-system)
3. A combination of both.

### File Structure

The addon folder structure is very simple:

~~~
addons/{my_addon_version}/{my_addon_name}
.
├── manifest.yml
├── icon.png
└── views
    └── main.html
└── tasks
    └── mytask.js
└── locales
    └── en-US.json
~~~

The simplest possible addon that has no views or tasks could be comprised of just a single `manifest.yml` file.

Let's continue with an explaination of the `manifest.yml` file.

### Manifest File

The `manifest.yml` manifest file is the most important file in an addon. Each addon must contain a single manifest file, which contains all the metadata information, configuration options, and a list of views and actions to be exposed by your addon.

The example manifest below is taken from the very basic  [Poke](https://github.com/tommyassociates/tommy_addon_sdk/tree/master/addons/poke/1.0.0) addon. This addon contains just one view, one task, and one action, and the manifest file looks like this:

```
---
  title: "Poke"
  package: "poke"
  version: "1.0.0"
  summary: "Unleash your inner mongrel."
  description: "This is a super imaginative long description for the Poke addon."
  developer: "Kam Low"
  homepage: "https://sourcey.com"
  private: false
  dependencies: &dependencies
    email: "*"
    chat: "*"
  tasks:
    default:
      name: "Default"
      description: "Task that fires the `poke.triggers.default` trigger."
      execute: "tasks/poke.js"
  triggers:
    default:
      name: "Default"
      description: "Trigger that contains a single message string parameter."
      parameters:
        message:
          type: "string"
          required: true
  actions:
    poke_to_message:
      title: "Poke chat message"
      description: "Send an annoying scheduled poke message to team members."
      task: "poke.tasks.default"
      trigger: "poke.triggers.default"
      activity: "chat.activities.send_message"
      mappings:
        message:
          title: "Message text"
          type: "variable"
          value: "trigger.message"
      dependencies: *dependencies
      timer:
        cron: "0 9 * * *"
  views:
    main:
      title: "Poke"
      file: "views/main.html"
      type: "page"
      framed: false
      default: true
      assets:
        -
          type: "stylesheet"
          file: "views/main.css"
        -
          type: "javascript"
          file: "views/main.js"
        -
          type: "template"
          file: "views/main.tpl.html"
```

The manifest options are as follows:

* **title**: (String) The human readable name of the addon.
* **package**: (String) The machine readable name of the addon in underscore case.
* **version**: (String) The release version number (must be incremented on each release).
* **author**: (String) The addons author name (may be individual or organisation).
* **private**: (Boolean) The privacy setting that determines if this addon is usable by other Tommy users or not.
* **views**: (Object) The object containing the views to be exposed on the interface.
* **actions**: (Object) The object containing the predefined actions implemented by the addon.
* **triggers**: (Object) The object containing the action triggers implemented by the addon.
* **conditions**: (Object) The object containing the action conditions implemented by the addon.
* **activities**: (Object) The object containing the action activities implemented by the addon.

#### Views

Each addon may contain multiple views to be exposed on the interface. Views are defined within the `views` option in the `manifest.yml` file.

* **id**: (String) The view page id (must be unique within addon scope).
* **name**: (String) The view page title.
* **file**: (String) The relative view path to the view HTML file ie. `client/main.html`.
* **type**: (String) The view type, current supported are `page` and `form`.
* **framed**: (Boolean) Weather or not the view should be loaded inside an iframe.
* **roles**: (Array) Can be any role that has been dynamically assigned to a team member, or one of the built in roles: "Team Member", "Team Manager", "Team Admin"

If you want your view to be framed inside an `iframe`, you can do so by specifying the `framed: true` option. This is good for securing your view data, but be aware that since your view will be running in a sandboxed environment, none of the Tommy environment, API instance, or CSS styles will be available for use.


## Understanding the Actions System

Each Addon may define a number of Actions that can be used to run dynamic code and perform arbitrary tasks that update the interface in realtime. The Tommy Actions system is exactly like an IFTTT system thats uses the following object: `Tasks`, `Triggers`, `Conditions`, and `Activities`.

<!--
[bark.js](https://github.com/tommyassociates/tommy_addon_sdk/blob/master/addons/poke/1.0.0/tasks/bark.jj)
-->

### Tasks

Tasks run a block of code at scheduled intervals and fire a `Trigger` when data is available or an internal condition is met. The code executed by tasks is completely implementation independent, but the data output by the script must be in a format that Tommy understands so the Actions system can execute the correct `Trigger`.

### Triggers

Triggers are executed by a `Task` and passed into the Actions system to be processed by an `Activity`.

### Conditions

Conditions are optional processors that check the `Trigger` data to determine if an `Activity` can be run. Conditions us conditional operators such as `greater_than`, `less_that` or `equal_to` to process `Trigger` data.

### Activities

Activities handle `Trigger` data and do something with it. This may include sending an email, notifying a user, or just about anything you could imagine with our internal or external third party APIs.

### Defining an Action

The easiest way to learn how to define an action is to reverse engineer what's already been built. Take for example the `poke` addon which defines an action that runs a `Task` (_poke.tasks.default_), a `Triggers` (_poke.triggers.default_) and an `Activity` (_chat.activities.send_message_).

```
actions:
  poke_to_message:
    title: "Poke chat message"
    description: "Send a poke message to users at scheduled intervals."
    task: "poke.tasks.default"
    trigger: "poke.triggers.default"
    activity: "chat.activities.send_message"
    mappings:
      message:
        title: "Message text"
        type: "variable"
        value: "trigger.message"
    timer:
      cron: "0 9 * * *"
    dependencies:
      chat: "1.0"
```

So what is actually going on here? It's pretty straight forward once you understand the syntax.

The `timer` parameter tells the actions system to run the specified task at [every day at 9am](https://en.wikipedia.org/wiki/Cron).

In our case the task being run is `poke.tasks.default`, whose only function is to fire the `poke.triggers.default` trigger. Both of these tasks and triggers are defined in the `manifest.yml` file, the full contents of which can be seen [here](https://github.com/tommyassociates/tommy_addon_sdk/blob/master/addons/poke/1.0.0/manifest.yml).

Our action definition specifies `chat.activities.send_message` as the activity to be run when the `poke.triggers.default` trigger is fired. As you may have guessed from the `chat.` prefix on the activity parameter, the `chat.activities.send_message` activity is actually defined externally in the `chat` addon, and the sole purpose of the activity is to send a chat message when run. This is how you reference an external addon's tasks, triggers and activities when programming your own addons. Note that if you reference an external addons items, then you must add them to the `dependency` list.

The other very important thing to mention is the `mappings` parameter. This describes how the activity will consume the trigger data. If our case the trigger just takes a simple `message` paramater, and our trigger also outputs a `message` param, so all we doing is mapping the trigger's `message` param with the activity.
