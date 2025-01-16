const fs = require("fs");
const common = rootRequire("core/common");
const crawler = rootRequire("core/crawler");
const importer = rootRequire("core/importer");
const db = rootRequire("core/db");
const browser = rootRequire("core/browser");
const http = require('http');
const downloadPath = process.env.CRAWLER_DOWNLOAD_PATH || "/tmp";

const event = common.event;
const options = {
    browser: {
        firefoxUserPrefs: {
            "browser.sessionstore.resume_from_crash": false,
            "browser.tabs.crashReporting.sendReport": false,
            "media.autoplay.default": 5,
            "media.autoplay.allow-extension-background-pages": false,
            "media.autoplay.block-event.enabled": true,
            "media.autoplay.enabled.user-gestures-needed": false,
            "dom.always_stop_slow_scripts": true,
            "dom.use_watchdog": true,
            "dom.max_script_run_time": 30,
            "dom.max_chrome_script_run_time": 60,
            "dom.max_ext_content_script_run_time": 15,
            "browser.cache.disk.enable": false,
            "browser.cache.memory.enable": false,
            "privacy.trackingprotection.enabled": false,
            "privacy.trackingprotection.fingerprinting.enabled": false,
            "privacy.trackingprotection.origin_telemetry.enabled": false,
            "privacy.trackingprotection.socialtracking.enabled": false,
            "privacy.trackingprotection.pbmode.enabled": false,
            "privacy.socialtracking.block_cookies.enabled": false,
            "network.cookie.cookieBehavior": 0,
            "security.fileuri.strict_origin_policy": false,
            "browser.download.folderList": 2,
            "pdfjs.disabled": true ,
            "browser.download.manager.showWhenStarting": false,
            "browser.download.dir": downloadPath,
            "browser.helperApps.neverAsk.saveToDisk": "text/csv,application/x-msexcel,application/excel,application/x-excel,application/vnd.ms-excel,image/png,image/jpeg,text/html,text/plain,application/msword,application/xml,application/pdf,application/zip",
            "browser.helperApps.alwaysAsk.force": false,
            "browser.download.manager.alertOnEXEOpen": false,
            "browser.download.manager.focusWhenStarting": false,
            "browser.download.manager.useWindow": false,
            "browser.download.manager.showAlertOnComplete": false,
            "browser.download.manager.closeWhenDone": false
        }
    }, context: {
        ignoreHTTPSErrors: true
    }, crawler: {
        maxDepth: 1, maxLinks: 1, randomizeLinks: true, maxRetries: 2, sameSite: false, depthFirst: true,
    }, seed: {
        list: "bb.csv", pageLimit: 100000
    },
};

module.exports = {
    options,
    seed,
    initialize,
    before,
    during,
    after,
};

const flowHandler = common.readFile("snippets/flowHandler.js");
let findings = [];
let post_reload = false;
let subpage = false;

async function initialize() {
    await browser.context().addInitScript(flowHandler);
    browser.context().exposeBinding("__crawler_taint_report", async function (source, value) {
        findings.push(value);
    });
}

async function seed(params) {
    await crawler.seed();
    await importer.csv({file: options.seed.list, limit: options.seed.pageLimit});
    await db.create(
        "inks(" +
        "pid INT UNSIGNED NOT NULL, stage VARCHAR(10), fid INT UNSIGNED NOT NULL, links LONGTEXT, " +
        "INDEX(pid), INDEX(stage)" +
        ")"
    );
}

async function before(params) {
    findings = [];
    post_reload = false;
    subpage = false;
}

async function during(params) {
    await common.sleep(2000);
    // console.log(findings);
}

async function after(params) {
    for (let f of findings) {
        let finding = await enhance_finding(f);
        // await send_finding(params, Object.assign({errored: params.error !== undefined }, finding));
        if (finding.taint){
            console.log(finding);
            await send_finding(params, Object.assign({errored: params.error !== undefined }, finding));
        }
    }
    console.log(`Exported ${findings.length} findings for ${params.protocol + params.host}`);
}

async function enhance_finding(finding) {
    let taints = [];
    if (!finding.taint){
        return finding;
    }
    for(let taint of finding.taint) {
        let ops = [];
        for(let op of taint.flow) {
            ops.push({operation: op.operation, source: op.source, builtin: op.builtin, function: op.location.function});
        }
        taint.hash = common.hash(ops);
        taints.push(taint);
    }
    finding.taint = taints;
    return finding;
}

async function send_finding(params, finding) {
    if (!finding.taint){
        return;
    }
    const url = `${params.protocol}${params.host}${params.path}${params.query}${params.fragment}`;
    const data = JSON.stringify({finding: Object.assign({pid: params.pid, base_url: url}, finding)});
    const options = {
        hostname: '127.0.0.1',
        port: 3000,
        path: '/finding',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        },
    };

    const req = http.request(options, res => {
        // console.log(`statusCode: ${res.statusCode}`);

        // res.on('data', d => {
        // process.stdout.write(d);
        // });
    });

    req.on('error', error => {
        console.error(`Error sending finding to export service: ${error} -- TERMINATING`);
        process.exit(5);
    });

    req.write(data);
    req.end();

}
