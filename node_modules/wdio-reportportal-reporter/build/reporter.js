"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const logger_1 = require("@wdio/logger");
const reporter_1 = require("@wdio/reporter");
const crypto_1 = require("crypto");
const path = require("path");
const ReportPortalClient = require("reportportal-js-client");
const constants_1 = require("./constants");
const entities_1 = require("./entities");
const ReporterOptions_1 = require("./ReporterOptions");
const storage_1 = require("./storage");
const utils_1 = require("./utils");
const log = (0, logger_1.default)("wdio-reportportal-reporter");
class ReportPortalReporter extends reporter_1.default {
    constructor(options) {
        super(options);
        this.storage = new storage_1.Storage();
        this.rpPromisesCompleted = true;
        this.currentTestAttributes = [];
        this.currentSuiteAttributes = [];
        this.currentSuiteDescription = [];
        this.suitesDescription = [];
        this.reporterOptions = Object.assign(new ReporterOptions_1.default(), options);
        this.registerListeners();
        if (this.reporterOptions.cucumberNestedSteps) {
            this.featureStatus = constants_1.STATUS.PASSED;
        }
    }
    get isSynchronised() {
        return this.rpPromisesCompleted;
    }
    set isSynchronised(value) {
        this.rpPromisesCompleted = value;
    }
    static sendLog(level, message) {
        (0, utils_1.sendToReporter)(constants_1.EVENTS.RP_LOG, { level, message });
    }
    static sendFile(level, name, content, type = "image/png", message = "") {
        (0, utils_1.sendToReporter)(constants_1.EVENTS.RP_FILE, { level, name, content, type, message });
    }
    static sendLogToTest(test, level, message) {
        (0, utils_1.sendToReporter)(constants_1.EVENTS.RP_TEST_LOG, { test, level, message });
    }
    static sendFileToTest(test, level, name, content, type = "image/png", message = "") {
        (0, utils_1.sendToReporter)(constants_1.EVENTS.RP_TEST_FILE, { test, level, name, content, type, message });
    }
    static finishTestManually(test) {
        (0, utils_1.sendToReporter)(constants_1.EVENTS.RP_TEST_RETRY, { test });
    }
    static addDescriptionToCurrentSuite(description) {
        (0, utils_1.sendToReporter)(constants_1.EVENTS.RP_SUITE_ADD_DESCRIPTION, description);
    }
    static addDescriptionToAllSuites(description) {
        (0, utils_1.sendToReporter)(constants_1.EVENTS.RP_ALL_SUITE_ADD_DESCRIPTION, description);
    }
    static getValidatedAttribute(attribute) {
        if (!attribute) {
            throw new Error("Attribute should be an object");
        }
        const clonedAttribute = Object.assign({}, attribute);
        if (clonedAttribute.value) {
            clonedAttribute.value = String(clonedAttribute.value);
            if (clonedAttribute.value.trim().length === 0) {
                throw Error("Attribute value should not be an empty string");
            }
        }
        else {
            throw new Error("Invalid attribute: " + JSON.stringify(attribute));
        }
        if (clonedAttribute.key) {
            clonedAttribute.key = String(clonedAttribute.key);
            if (clonedAttribute.key.trim().length === 0) {
                throw Error("Attribute key should not be an empty string");
            }
        }
        return clonedAttribute;
    }
    static addAttribute(attribute) {
        (0, utils_1.sendToReporter)(constants_1.EVENTS.RP_TEST_ATTRIBUTES, Object.assign({}, this.getValidatedAttribute(attribute)));
    }
    static addAttributeToSuite(attribute) {
        (0, utils_1.sendToReporter)(constants_1.EVENTS.RP_SUITE_ATTRIBUTES, Object.assign({}, this.getValidatedAttribute(attribute)));
    }
    onSuiteStart(suite) {
        log.debug(`Start suite ${suite.title} ${suite.uid}`);
        this.specFilePath = suite.file;
        const isCucumberFeature = suite.type === constants_1.CUCUMBER_TYPE.FEATURE;
        const isCucumberScenario = suite.type === constants_1.CUCUMBER_TYPE.SCENARIO;
        const suiteStartObj = this.reporterOptions.cucumberNestedSteps ?
            new entities_1.StartTestItem(suite.title, isCucumberFeature ? constants_1.TYPE.TEST : constants_1.TYPE.STEP) :
            new entities_1.StartTestItem(suite.title, constants_1.TYPE.SUITE);
        if (isCucumberFeature) {
            (0, utils_1.addSauceLabAttributes)(this.reporterOptions, suiteStartObj, this.sessionId);
        }
        if (isCucumberScenario) {
            suiteStartObj.codeRef = (0, utils_1.getRelativePath)(this.specFilePath) + ':' + suite.uid.replace(suite.title, '').trim();
        }
        if (this.reporterOptions.cucumberNestedSteps && this.reporterOptions.autoAttachCucumberFeatureToScenario) {
            switch (suite.type) {
                case constants_1.CUCUMBER_TYPE.FEATURE:
                    this.featureName = suite.title;
                    break;
                case constants_1.CUCUMBER_TYPE.SCENARIO:
                    suiteStartObj.attributes = [
                        {
                            key: constants_1.CUCUMBER_TYPE.FEATURE,
                            value: this.featureName,
                        },
                    ];
                    if (this.reporterOptions.setRetryTrue) {
                        suiteStartObj.retry = true;
                    }
                    break;
            }
        }
        const suiteItem = this.storage.getCurrentSuite();
        let parentId = null;
        if (suiteItem !== null) {
            parentId = suiteItem.id;
        }
        if (this.reporterOptions.parseTagsFromTestTitle) {
            suiteStartObj.addTags();
        }
        suiteStartObj.description = [...this.suitesDescription, ...this.currentSuiteDescription].join('\n');
        const { tempId, promise } = this.client.startTestItem(suiteStartObj, this.tempLaunchId, parentId);
        (0, utils_1.promiseErrorHandler)(promise);
        this.storage.addSuite(new entities_1.StorageEntity(suiteStartObj.type, tempId, promise, suite));
    }
    onSuiteEnd(suite) {
        log.debug(`End suite ${suite.title} ${suite.uid}`);
        const isSomeTestFailed = suite.tests.some(({ state }) => state === constants_1.WDIO_TEST_STATUS.FAILED);
        let suiteStatus = isSomeTestFailed ? constants_1.STATUS.FAILED : constants_1.STATUS.PASSED;
        if (this.reporterOptions.cucumberNestedSteps) {
            switch (suite.type) {
                case constants_1.CUCUMBER_TYPE.SCENARIO:
                    const scenarioStepsAllPassed = suite.tests.every(({ state }) => state === constants_1.WDIO_TEST_STATUS.PASSED);
                    const scenarioStepsSkipped = isSomeTestFailed ? false : suite.tests.some(({ state }) => state === constants_1.WDIO_TEST_STATUS.SKIPPED);
                    suiteStatus = scenarioStepsAllPassed ? constants_1.STATUS.PASSED : scenarioStepsSkipped ? constants_1.STATUS.SKIPPED : constants_1.STATUS.FAILED;
                    this.featureStatus = this.featureStatus === constants_1.STATUS.PASSED && suiteStatus === constants_1.STATUS.PASSED ? constants_1.STATUS.PASSED : constants_1.STATUS.FAILED;
                    break;
                case constants_1.CUCUMBER_TYPE.FEATURE:
                    suiteStatus = this.featureStatus;
                    break;
            }
        }
        const suiteItem = this.storage.getCurrentSuite();
        const finishSuiteObj = suiteStatus === constants_1.STATUS.SKIPPED ? new entities_1.EndTestItem(constants_1.STATUS.SKIPPED, new entities_1.Issue("NOT_ISSUE")) : { status: suiteStatus, attributes: this.currentSuiteAttributes, description: [...this.suitesDescription, ...this.currentSuiteDescription].join('\n') };
        const { promise } = this.client.finishTestItem(suiteItem.id, finishSuiteObj);
        (0, utils_1.promiseErrorHandler)(promise);
        this.currentSuiteDescription = [];
        this.storage.removeSuite();
    }
    onTestStart(test, type = constants_1.TYPE.STEP) {
        log.debug(`Start test ${test.title} ${test.uid}`);
        if (this.storage.getCurrentTest()) {
            return;
        }
        const suite = this.storage.getCurrentSuite();
        const testStartObj = new entities_1.StartTestItem(test.title, type);
        if (this.isCucumberFramework) {
            (0, utils_1.addCodeRefCucumber)(this.specFilePath, test, testStartObj);
        }
        else {
            (0, utils_1.addCodeRef)(this.specFilePath, test.fullTitle, testStartObj);
        }
        if (this.reporterOptions.cucumberNestedSteps) {
            testStartObj.hasStats = false;
        }
        else {
            (0, utils_1.addSauceLabAttributes)(this.reporterOptions, testStartObj, this.sessionId);
        }
        if (this.reporterOptions.parseTagsFromTestTitle) {
            testStartObj.addTags();
        }
        if (this.reporterOptions.setRetryTrue) {
            testStartObj.retry = true;
        }
        (0, utils_1.addBrowserParam)(this.sanitizedCapabilities, testStartObj);
        const { tempId, promise } = this.client.startTestItem(testStartObj, this.tempLaunchId, suite.id);
        (0, utils_1.promiseErrorHandler)(promise);
        this.storage.addTest(test.uid, new entities_1.StorageEntity(testStartObj.type, tempId, promise, test));
        return promise;
    }
    onTestPass(test) {
        log.debug(`Pass test ${test.title} ${test.uid}`);
        this.testFinished(test, constants_1.STATUS.PASSED);
    }
    onTestFail(test) {
        log.debug(`Fail test ${test.title} ${test.uid} ${test.error.stack}`);
        const testItem = this.storage.getCurrentTest();
        if (testItem === null) {
            this.onTestStart(test, constants_1.TYPE.BEFORE_METHOD);
        }
        this.testFinished(test, constants_1.STATUS.FAILED);
    }
    onTestSkip(test) {
        log.debug(`Skip test ${test.title} ${test.uid}`);
        const testItem = this.storage.getCurrentTest();
        if (testItem === null) {
            this.onTestStart(test);
        }
        this.testFinished(test, constants_1.STATUS.SKIPPED, new entities_1.Issue("NOT_ISSUE"));
    }
    testFinished(test, status, issue) {
        log.debug(`Finish test ${test.title} ${test.uid}`);
        const testItem = this.storage.getCurrentTest();
        if (testItem === null) {
            return;
        }
        const finishTestObj = new entities_1.EndTestItem(status, issue);
        if (status === constants_1.STATUS.FAILED) {
            const stacktrace = test.error.stack;
            const message = this.reporterOptions.sanitizeErrorMessages ?
                stacktrace.replace((0, utils_1.ansiRegex)(), '') : `${stacktrace}`;
            finishTestObj.description = `❌ ${message}`;
            this.client.sendLog(testItem.id, {
                level: constants_1.LEVEL.ERROR,
                message,
            });
        }
        finishTestObj.attributes = [...this.currentTestAttributes];
        const { promise } = this.client.finishTestItem(testItem.id, finishTestObj);
        (0, utils_1.promiseErrorHandler)(promise);
        this.storage.removeTest(testItem);
        this.currentTestAttributes = [];
    }
    onRunnerStart(runner) {
        log.debug(`Runner start`);
        this.rpPromisesCompleted = false;
        this.isMultiremote = runner.isMultiremote;
        this.sanitizedCapabilities = runner.sanitizedCapabilities;
        this.sessionId = runner.sessionId;
        this.isCucumberFramework = runner.config.framework === 'cucumber';
        this.client = this.getReportPortalClient();
        this.launchId = process.env.RP_LAUNCH_ID;
        const startLaunchObj = {
            attributes: this.reporterOptions.reportPortalClientConfig.attributes,
            description: this.reporterOptions.reportPortalClientConfig.description,
            id: this.launchId,
            mode: this.reporterOptions.reportPortalClientConfig.mode,
            rerun: false,
            rerunOf: null,
        };
        if (runner.retry > 0) {
            delete startLaunchObj.id;
            startLaunchObj.rerun = true;
            startLaunchObj.rerunOf = this.launchId;
            const result = this.client.startLaunch(startLaunchObj);
            this.tempLaunchId = result.tempId;
        }
        else {
            const { tempId } = this.client.startLaunch(startLaunchObj);
            this.tempLaunchId = tempId;
        }
    }
    onRunnerEnd(runnerStats) {
        return __awaiter(this, void 0, void 0, function* () {
            log.debug(`Runner end`);
            try {
                return yield this.client.getPromiseFinishAllItems(this.tempLaunchId);
            }
            catch (e) {
                log.error("An error occurs on finish test items");
                log.error(e);
            }
            finally {
                this.isSynchronised = true;
                log.debug(`Runner end sync`);
            }
        });
    }
    onBeforeCommand(command) {
        if (!this.reporterOptions.reportSeleniumCommands || this.isMultiremote) {
            return;
        }
        const method = `${command.method} ${command.endpoint}`;
        if (!(0, utils_1.isEmpty)(command.body)) {
            const data = JSON.stringify((0, utils_1.limit)(command.body));
            this.sendLog({ message: `${method} ${data}`, level: this.reporterOptions.seleniumCommandsLogLevel });
        }
        else {
            this.sendLog({ message: `${method}`, level: this.reporterOptions.seleniumCommandsLogLevel });
        }
    }
    onAfterCommand(command) {
        if (this.isMultiremote) {
            return;
        }
        const isScreenshot = (0, utils_1.isScreenshotCommand)(command) && command.result.value;
        const { autoAttachScreenshots, screenshotsLogLevel, seleniumCommandsLogLevel, reportSeleniumCommands } = this.reporterOptions;
        if (isScreenshot) {
            if (autoAttachScreenshots) {
                const obj = {
                    content: command.result.value,
                    level: screenshotsLogLevel,
                    name: "screenshot.png",
                    message: "screenshot"
                };
                this.sendFile(obj);
            }
        }
        if (reportSeleniumCommands) {
            if (command.body && !(0, utils_1.isEmpty)(command.result.value)) {
                delete command.result.sessionId;
                const data = JSON.stringify((0, utils_1.limit)(command.result));
                this.sendLog({ message: `${data}`, level: seleniumCommandsLogLevel });
            }
        }
    }
    onHookStart(hook) {
        log.debug(`Start hook ${hook.title} ${hook.uid}`);
    }
    onHookEnd(hook) {
        log.debug(`End hook ${hook.title} ${hook.uid} ${JSON.stringify(hook)}`);
        if (hook.error) {
            const testItem = this.storage.getCurrentTest();
            if (testItem === null) {
                this.onTestStart(hook, constants_1.TYPE.BEFORE_METHOD);
            }
            this.testFinished(hook, constants_1.STATUS.FAILED);
        }
    }
    getReportPortalClient() {
        return new ReportPortalClient(this.reporterOptions.reportPortalClientConfig);
    }
    addDescriptionToCurrentSuite(description) {
        this.currentSuiteDescription.push(description);
    }
    addDescriptionToAllSuites(description) {
        this.suitesDescription.push(description);
    }
    addAttribute(attribute) {
        this.currentTestAttributes.push(Object.assign({}, attribute));
    }
    addAttributeToSuite(attribute) {
        this.currentSuiteAttributes.push(attribute);
    }
    finishTestManually(event) {
        const testItem = this.storage.getCurrentTest();
        if (testItem === null) {
            return;
        }
        const err = {
            stack: event.test.error,
        };
        const test = {
            error: err,
            title: testItem.wdioEntity.title,
            uid: testItem.wdioEntity.uid,
        };
        this.testFinished(test, constants_1.STATUS.FAILED);
    }
    sendLog(event) {
        const testItem = this.storage.getCurrentTest();
        if (testItem === null) {
            log.warn("Cannot send log message. There is no running tests");
            return;
        }
        const { promise } = this.client.sendLog(testItem.id, {
            level: event.level,
            message: String(event.message),
        });
        (0, utils_1.promiseErrorHandler)(promise);
    }
    sendFile({ level, name, content, type = "image/png", message = "" }) {
        const testItem = this.storage.getCurrentTest();
        if (!testItem) {
            log.warn(`Can not send file to test. There is no running tests`);
            return;
        }
        const { promise } = this.client.sendLog(testItem.id, { level, message }, { name, content, type, message });
        (0, utils_1.promiseErrorHandler)(promise);
    }
    sendLogToTest({ test, level, message }) {
        return __awaiter(this, void 0, void 0, function* () {
            const testObj = this.storage.getStartedTests().reverse().find((startedTest) => {
                return startedTest.wdioEntity.title === test.title;
            });
            if (!testObj) {
                log.warn(`Can not send log to test ${test.title}`);
                return;
            }
            const rs = yield testObj.promise;
            const saveLogRQ = {
                itemUuid: rs.id,
                launchUuid: this.launchId,
                level,
                message,
                time: this.now(),
            };
            const url = [this.client.baseURL, "log"].join("/");
            const promise = this.client.helpers.getServerResult(url, saveLogRQ, { headers: this.client.headers }, "POST");
            (0, utils_1.promiseErrorHandler)(promise);
        });
    }
    sendFileToTest({ test, level, name, content, type = "image/png", message = "" }) {
        return __awaiter(this, void 0, void 0, function* () {
            const testObj = this.storage.getStartedTests().reverse().find((startedTest) => {
                return startedTest.wdioEntity.title === test.title;
            });
            if (!testObj) {
                log.warn(`Can not send file to test ${test.title}`);
                return;
            }
            const rs = yield testObj.promise;
            const saveLogRQ = {
                itemUuid: rs.id,
                launchUuid: this.launchId,
                level,
                message,
                time: this.now(),
            };
            // to avoid https://github.com/BorisOsipov/wdio-reportportal-reporter/issues/42#issuecomment-456573592
            const fileName = (0, crypto_1.createHash)("md5").update(name).digest("hex");
            const extension = path.extname(name) || ".dat";
            const promise = this.client.getRequestLogWithFile(saveLogRQ, { name: `${fileName}${extension}`, content, type });
            (0, utils_1.promiseErrorHandler)(promise);
        });
    }
    registerListeners() {
        process.on(constants_1.EVENTS.RP_LOG, this.sendLog.bind(this));
        process.on(constants_1.EVENTS.RP_FILE, this.sendFile.bind(this));
        process.on(constants_1.EVENTS.RP_TEST_LOG, this.sendLogToTest.bind(this));
        process.on(constants_1.EVENTS.RP_TEST_FILE, this.sendFileToTest.bind(this));
        process.on(constants_1.EVENTS.RP_TEST_RETRY, this.finishTestManually.bind(this));
        process.on(constants_1.EVENTS.RP_TEST_ATTRIBUTES, this.addAttribute.bind(this));
        process.on(constants_1.EVENTS.RP_SUITE_ATTRIBUTES, this.addAttributeToSuite.bind(this));
        process.on(constants_1.EVENTS.RP_SUITE_ADD_DESCRIPTION, this.addDescriptionToCurrentSuite.bind(this));
        process.on(constants_1.EVENTS.RP_ALL_SUITE_ADD_DESCRIPTION, this.addDescriptionToAllSuites.bind(this));
    }
    now() {
        return this.client.helpers.now();
    }
}
ReportPortalReporter.reporterName = "reportportal";
module.exports = ReportPortalReporter;
