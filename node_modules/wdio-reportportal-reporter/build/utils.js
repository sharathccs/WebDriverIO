"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ansiRegex = exports.addCodeRefCucumber = exports.addCodeRef = exports.getRelativePath = exports.sendToReporter = exports.isScreenshotCommand = exports.parseTags = exports.addDescription = exports.addSauceLabAttributes = exports.addBrowserParam = exports.limit = exports.isEmpty = exports.promiseErrorHandler = void 0;
// @ts-ignore
const logger_1 = require("@wdio/logger");
const validator_1 = require("validator");
const path = require("path");
const stringify = require("json-stringify-safe");
const OBJLENGTH = 10;
const ARRLENGTH = 10;
const STRINGLIMIT = 1000;
const STRINGTRUNCATE = 200;
const TAGS_PATTERN = /\B@[a-z0-9_-]+/gi;
const log = (0, logger_1.default)("wdio-reportportal-reporter");
const promiseErrorHandler = (promise) => {
    promise.catch((err) => {
        log.error(err);
    });
};
exports.promiseErrorHandler = promiseErrorHandler;
const isEmpty = (object) => !object || Object.keys(object).length === 0;
exports.isEmpty = isEmpty;
/**
 * Limit the length of an arbitrary variable of any type, suitable for being logged or displayed
 * @param  {Any} val Any variable
 * @return {Any} Limited var of same type
 */
const limit = (val) => {
    if (!val) {
        return val;
    }
    // Ensure we're working with a copy
    let value = JSON.parse(stringify(val));
    switch (Object.prototype.toString.call(value)) {
        case "[object String]":
            if (value.length > 100 && validator_1.default.isBase64(value)) {
                return `[base64] ${value.length} bytes`;
            }
            if (value.length > STRINGLIMIT) {
                return `${value.substr(0, STRINGTRUNCATE)} ... (${value.length - STRINGTRUNCATE} more bytes)`;
            }
            return value;
        case "[object Array]": {
            const { length } = value;
            if (length > ARRLENGTH) {
                value = value.slice(0, ARRLENGTH);
                value.push(`(${length - ARRLENGTH} more items)`);
            }
            return value.map(exports.limit);
        }
        case "[object Object]": {
            const keys = Object.keys(value);
            const removed = [];
            for (let i = 0, l = keys.length; i < l; i += 1) {
                if (i < OBJLENGTH) {
                    value[keys[i]] = (0, exports.limit)(value[keys[i]]);
                }
                else {
                    delete value[keys[i]];
                    removed.push(keys[i]);
                }
            }
            if (removed.length) {
                value._ = `${keys.length - OBJLENGTH} more keys: ${JSON.stringify(removed)}`;
            }
            return value;
        }
        default: {
            return value;
        }
    }
};
exports.limit = limit;
const addBrowserParam = (browser, testItem) => {
    if (browser) {
        const param = { key: "browser", value: browser };
        if (Array.isArray(testItem.parameters)) {
            testItem.parameters.push(param);
            return;
        }
        testItem.parameters = [param];
    }
};
exports.addBrowserParam = addBrowserParam;
const addSauceLabAttributes = (options, testItem, sessionId) => {
    const { sauceLabOptions } = options;
    if (sauceLabOptions === null || sauceLabOptions === void 0 ? void 0 : sauceLabOptions.enabled) {
        testItem.addSLID(sessionId);
        if (sauceLabOptions.sldc) {
            testItem.addSLDC(sauceLabOptions.sldc);
        }
    }
};
exports.addSauceLabAttributes = addSauceLabAttributes;
const addDescription = (description, testItem) => {
    if (description) {
        testItem.description = description;
    }
};
exports.addDescription = addDescription;
const parseTags = (text) => ("" + text).match(TAGS_PATTERN) || [];
exports.parseTags = parseTags;
const isScreenshotCommand = (command) => {
    const isScreenshotEndpoint = /\/session\/[^/]*\/screenshot/;
    return isScreenshotEndpoint.test(command.endpoint);
};
exports.isScreenshotCommand = isScreenshotCommand;
const sendToReporter = (event, msg = {}) => {
    // @ts-ignore
    process.emit(event, msg);
};
exports.sendToReporter = sendToReporter;
const getRelativePath = (val) => val.replace(`${process.cwd()}${path.sep}`, '').trim();
exports.getRelativePath = getRelativePath;
const addCodeRef = (specFilePath, testname, testItem) => {
    testItem.codeRef = `${(0, exports.getRelativePath)(specFilePath)}:${testname}`;
};
exports.addCodeRef = addCodeRef;
const addCodeRefCucumber = (specFilePath, test, testItem) => {
    const testTitleNoKeyword = test.title.replace(/^(Given|When|Then|And) /g, '').trim();
    testItem.codeRef = `${(0, exports.getRelativePath)(specFilePath)}:${test.uid.replace(testTitleNoKeyword, '').trim()}`;
};
exports.addCodeRefCucumber = addCodeRefCucumber;
function ansiRegex() {
    const pattern = [
        '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
        '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))'
    ].join('|');
    return new RegExp(pattern, 'g');
}
exports.ansiRegex = ansiRegex;
