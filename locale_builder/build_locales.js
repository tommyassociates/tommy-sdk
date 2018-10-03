// import scanner from 'i18next-scanner';
// import vfs from 'vinyl-fs';
// import fs from 'fs';
// import path from 'path';
// import yaml from 'js-yaml';
// import _ from 'lodash';

const scanner = require('i18next-scanner')
const vfs = require('vinyl-fs')
const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const _ = require('lodash')

/*
npm install --save-dev i18next-scanner vinyl-fs js-yaml lodash

node build_locales

zip -R tommy_addons_i18n.zip '*en-US.json' '*zh-CN.json'

find . -name '*en-US.json' -delete
*/

// Unquotes a string
const unquote = (str, quoteChar) => {
    quoteChar = quoteChar || '"';
    if (str[0] === quoteChar && str[str.length - 1] === quoteChar) {
        return str.slice(1, str.length - 1)
    }
    return str;
};

// Parses hash arguments for Handlebars block helper
// @see [Hash Arguments]{@http://code.demunskin.com/other/Handlebars/block_helpers.html#hash-arguments}
// @see [Regular expression for parsing name value pairs]{@link http://stackoverflow.com/questions/168171/regular-expression-for-parsing-name-value-pairs}
// @example <caption>Example usage:</caption>
// it will output ["id=nav-bar", "class = "top"", "foo = "bar\"baz""]
// var str = ' id=nav-bar class = "top" foo = "bar\\"baz" ';
// str.match(/([^=,\s]*)\s*=\s*((?:"(?:\\.|[^"\\]+)*"|'(?:\\.|[^'\\]+)*')|[^'"\s]*)/igm) || [];
// @param [string] str A string representation of hash arguments
// @return {object}
const parseHashArguments = str => {
    const hash = {};

    const results = str.match(/([^=,\s]*)\s*=\s*((?:"(?:\\.|[^"\\]+)*"|'(?:\\.|[^'\\]+)*')|[^'"\s]*)/igm) || [];
    results.forEach(result => {
        result = _.trim(result)
        const r = result.match(/([^=,\s]*)\s*=\s*((?:"(?:\\.|[^"\\]+)*"|'(?:\\.|[^'\\]+)*')|[^'"\s]*)/) || [];
        if (r.length < 3 || _.isUndefined(r[1]) || _.isUndefined(r[2])) {
            return;
        }

        const key = _.trim(r[1]);
        let value = _.trim(r[2]);

        { // value is enclosed with either single quote (') or double quote (") characters
            const quoteChars = '\'"';
            const quoteChar = _.find(quoteChars, (quoteChar) => {
                return value.charAt(0) === quoteChar;
            })
            if (quoteChar) { // single quote (') or double quote (")
                value = unquote(value, quoteChar)
            }
        }

        hash[key] = value;
    })

    return hash;
};

const parseTemplate7 = (parser, content) => {
    const results = content.match(/{{t\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')?([^}]*)}}/gm) || [];
    _.each(results, result => {
        let key;
        let value;
        const r = result.match(/{{t\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')?([^}]*)}}/m) || [];

        if (! _.isUndefined(r[1])) {
            key = _.trim(r[1], '\'"')

            // Replace double backslash with single backslash
            key = key.replace(/\\\\/g, '\\')
            key = key.replace(/\\\'/, '\'')
        }

        const params = parseHashArguments(r[2]);
        if (_.has(params, 'defaultValue')) {
            value = params['defaultValue'];
        }

        if (_.isUndefined(key)) { // && _.isUndefined(value)
            return;
        }

        // console.log('params', params)
        // if (_.isUndefined(key)) {
        //     key = hash(value) // returns a hash value as its default key
        // }

        console.log('Setting', key, '=', value)
        parser.set(key, value)
    })
};

const parseManifest = (parser, content) => {
    const data = yaml.safeLoad(content)
    const properties = ['title', 'hint', 'summary', 'description' ];

    const setProp = (scope, name, key, value, noScope) => {
        if (value) {
            key = `${(noScope ? '' : (scope + '.')) + name}.${key}`;
            console.log('Setting', key, value)
            parser.set(key, value)
        }
    };

    const setItem = (scope, name, item, noScope) => {
        properties.forEach(prop => {
            setProp(scope, name, prop, item[prop], noScope)
        })
    };

    const setItems = (root, scope, noScope) => {
        if (root) {
            for (const name in root[scope]) {
                setItem(scope, name, root[scope][name], noScope)
            }
        }
    };

    const setNestedItems = (root, scope, nestedScope) => {
        if (root) {
            for (const name in root[scope]) {
                setItems(root[scope][name], nestedScope)
            }
        }
    };

    if (data.title)
        parser.set('title', data.title)
    if (data.summary)
        parser.set('summary', data.summary)
    if (data.description)
        parser.set('description', data.description)
    if (data.developer)
        parser.set('developer', data.developer)

    setItems(data, 'permissions')
    setItems(data, 'tasks')
    setItems(data, 'triggers')
    // setItems(data, 'options')
    setItems(data, 'conditions')
    setItems(data, 'activities')
    setItems(data, 'actions')
    setItems(data, 'views') //, true)

    setNestedItems(data, 'tasks', 'options')
    setNestedItems(data, 'triggers', 'parameters')
    setNestedItems(data, 'conditions', 'options')
    setNestedItems(data, 'activities', 'parameters')
    setNestedItems(data, 'actions', 'mappings')
};

// Custom transformer for Handlebars helper syntax
const customTransform = function(file, enc, done) {
    const parser = this.parser;
    // var extname = path.extname(file.path)
    const content = fs.readFileSync(file.path, enc);

    if (file.path.includes('.html')) {
        console.log('Parsing HTML file', file.path)
        parseTemplate7(parser, content)
    }

    if (file.path.includes('manifest.yml')) {
        console.log('Parsing manifest', file.path)
        parseManifest(parser, content)
    }

    done()
};


const transformPath = dir => {
    // See options at https://github.com/i18next/i18next-scanner#options
    const options = {
        lngs: ['en-US', 'zh-CN'],
        resource: {
            loadPath: `${dir}/locales/{{lng}}.json`,
            savePath: 'locales/{{lng}}.json',
        }
    };

    vfs.src([`${dir}/**/*.html`, `${dir}/manifest.yml`])
      .pipe(scanner(options, customTransform))
      .pipe(vfs.dest(dir))
};


const dirs = [
    // '../availability/1.0.0',
    // '../bookings/1.0.0',
    // '../calendar/1.0.0',
    // '../chat/1.0.0',
    // '../clock/1.0.0',
    // '../email/1.0.0',
    // '../timesheets/1.0.0',
    // '../tommy/1.0.0',
    // '../weather/1.0.0'
    '../addons/tasks/1.0.0',
].forEach(dir => {
    transformPath(path.resolve(dir))
});


// var dirs = ['*/1.0.0' ]

// See options at https://github.com/i18next/i18next-scanner#options
// var options = {
//     lngs: ['en-US', 'zh-CN'],
//     resource: {
//         loadPath: 'www/locales/{{lng}}.json',
//         savePath: 'locales/{{lng}}.json',
//     }
// };

// vfs.src(['www/**/*.html'])
//   .pipe(scanner(options, customTransform))
//   .pipe(vfs.dest('www'))
