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
        ignoreHTTPSErrors: true,
        hasTouch: true
    }, crawler: {
        maxDepth: 1, maxLinks: 1, randomizeLinks: true, maxRetries: 2, sameSite: false, depthFirst: true,
    }, seed: {
        list: "random_login.csv", pageLimit: 100000
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
    await common.sleep(1000);
    page = browser.page();
    await triggerEventHandlers(page);
    // console.log(findings);
}

async function after(params) {
    for (let f of findings) {
        let finding = await enhance_finding(f);
        // await send_finding(params, Object.assign({errored: params.error !== undefined }, finding));
        if (finding.taint){
            // console.log(finding);
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

const triggerClickEvent = async (page) => {
    await page.evaluate(() => {
        document.body.click();
    });
    await common.sleep(500);
    await page.evaluate(() => {
        document.body.click();
    });
    await common.sleep(500);
    await page.evaluate(() => {
        document.body.click();
    });
    await common.sleep(500);
    await page.evaluate(() => {
        document.body.click();
    });
}

const triggerFocusBlurEvent = async (page) => {
    const inputElements = await page.$$('input');
    for (const input of inputElements) {
        try {
      // Scroll the element into view
      await page.evaluate((element) => {
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }, input);

      // Wait for the element to be visible and clickable
      await page.waitForSelector('input', { visible: true, timeout: 1500});
      // Click the element
      await input.click({timeout:0});
      console.log('Clicked input element');
      // Optionally wait a bit between clicks
    //   await page.waitForTimeout(500);
    } catch (error) {
      console.error('Error clicking input element:', error);
    }
  }
    //To trigger blur event
    // await page.click('body')
}

const triggerDoubleClickEvent = async(page) => {
    await page.evaluate(() => {
        const element = document.querySelector('body'); // Replace 'body' with any valid selector for the element you want to double-click.
        if (element) {
            const event = new MouseEvent('dblclick', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            console.log('Attempting to trigger double click event handlers')
            element.dispatchEvent(event);
        }
    });
    
}
const triggerMouseEvents = async (page) => {
    // Simulate other mouse events on the first input
    try {
        const body = await page.$$('body');
    
        const box = await body[0].boundingBox();

        // Mouse move to the element
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {timeout: 60000});

        // Mouse down event
        await page.mouse.down({timeout: 60000});

        // Mouse up event
        await page.mouse.up({timeout: 60000});

        // Mouse enter event doesn't directly exist, but moving the mouse to the element simulates it
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {timeout: 60000});
    } catch (e) {
        console.log('Error occured while trying to trigger mousemove event: ' + e);
    }
    
}


const triggerKeyEvents = async (page) => {
    await page.keyboard.press('Tab', { delay: 100 });
    await page.keyboard.down('Shift');
    await page.keyboard.press('!');  // Example to show Shift+1 -> !
    await page.keyboard.up('Shift');
}
const triggerCopyPasteEvents = async (page) => {
    await page.keyboard.down('Control');
    await page.keyboard.press('C'); // Assuming Windows/Linux. Use 'Meta' for macOS.
    await page.keyboard.up('Control');

    await page.keyboard.down('Control');
    await page.keyboard.press('V'); // Assuming Windows/Linux. Use 'Meta' for macOS.
    await page.keyboard.up('Control');
}

const triggerScrollEvent = async (page) => {
    const scrollStep = 100; // 100 px per step
    const scrollInterval = 100; // ms between each scroll
    let lastPosition = 0;
    let newPosition = 0;

    while (true) {
        // console.log("1")
        newPosition = await page.evaluate((step) => {
            window.scrollBy(0, step);
            return window.pageYOffset;  // Get the new scroll position
        }, scrollStep);
        // If no more scrolling is possible, break the loop
        if (newPosition === lastPosition) {
            break;
        }
        lastPosition = newPosition;
        await common.sleep(scrollInterval);  // Wait before the next scroll
    }

    // Optionally scroll up or down using mouse if necessary
    try {
        await page.mouse.wheel(0, -100);  // Ensure enough timeout if mouse interaction is needed
    } catch (error) {
        console.error("Mouse wheel error:", error);
    }
}

const triggerWindowResize = async (page) => {
   
    const landscape = { width: 1280, height: 1000 };
    await page.setViewportSize(landscape);
    console.log('Set to landscape');

}
const triggerOrientationChangeEvents = async (page) => {
    // Dispatch an orientation change event
    await page.evaluate(() => {
      // Simulate changing to landscape
      Object.defineProperty(screen, 'orientation', {
          value: { angle: 90, type: 'landscape-primary' },
          writable: true
      });

      // Create and dispatch the event
      const event = new Event('orientationchange');
      window.dispatchEvent(event);
  });

}


const triggerTouchEvents = async (page) => {
    try{
        await page.touchscreen.tap(100, 150);
        await common.sleep(500);
        await page.touchscreen.tap(120, 130);
        await common.sleep(500);
        await page.touchscreen.tap(140, 110);
    }
    catch (error) {
        console.error("touch event error error:", error);
    }
}

const triggerEventHandlers = async (page) => {
    await common.sleep(250);
    console.log('Triggering the click event')
    await triggerClickEvent(page)
    await common.sleep(250);
    console.log('Triggering double click event')
    await triggerDoubleClickEvent(page)
    await common.sleep(250);
    console.log('Triggering mouse events')
    await triggerMouseEvents(page)
    await common.sleep(250);
    console.log('Triggering keyboard events')
    await triggerKeyEvents(page)
    await common.sleep(250);
    console.log('Triggering copy/paste events')
    await triggerCopyPasteEvents(page)
    await common.sleep(250);
    console.log('Triggering scroll/wheel events')
    await triggerScrollEvent(page)
    await common.sleep(250);
    console.log('Triggering resize events')
    await triggerWindowResize(page)
    await common.sleep(250);
    console.log('Triggering orientation events')
    await triggerOrientationChangeEvents(page)
    await common.sleep(250);
    console.log('Triggering touch events')
    await triggerTouchEvents(page)
}

// const configureConsentOMatic = async (browser) => {
//     const page = await browser.newPage();
//     
//     // Navigate directly to the options page
//     await page.goto('chrome-extension://pogpcelnjdlchjbjcakalbgppnhkondb/options.html');
//     console.log('Gone to consent-o-matic configuration page')
//     // Check if the correct page is loaded
//     if (page.url() === 'chrome-extension://pogpcelnjdlchjbjcakalbgppnhkondb/options.html') {
//         console.log('On the correct options page');

//         // Set all sliders to true to accept all possible consent banners
//         await page.evaluate(() => {
//             let sliders = document.querySelectorAll('.categorylist li .knob');
//             sliders.forEach(slider => {
//                 document.querySelector
//                 if (slider.ariaChecked === 'false') {
//                     slider.click(); // This toggles the checkbox to 'true' if not already set
//                 }
//             });
//             //Go to dev tab of consent-o-matic extension settings
//             let devTab = document.querySelector('.debug');
//             devTab.click()
//             //Enable the debug log if not already enabled 
//             let debugClicksSlider = document.querySelector('[data-name=debugClicks]')
//             if (debugClicksSlider.className !== 'active') {
//                 debugClicksSlider.click()
//             }

//             let skipHideMethodSlider = document.querySelector('[data-name=skipHideMethod]')
//             if (skipHideMethodSlider.className !== 'active') {
//                 skipHideMethodSlider.click()
//             }

//             let dontHideProgressDialogSlider = document.querySelector('[data-name=dontHideProgressDialog]')
//             if (dontHideProgressDialogSlider.className !== 'active') {
//                 dontHideProgressDialogSlider.click()
//             }
//             
//             let debugLogSlider = document.querySelector('[data-name=debugLog]')
//             if (debugLogSlider.className !== 'active') {
//                 debugLogSlider.click()
//             }

//         });


//         console.log('All sliders set to true');
//     } else {
//         console.log('Not on the correct page, check the URL');
//     }
//     
//     await page.close();
// }

// const registerConsentBannerDetector = async (page) => {
//     return new Promise( (resolve, reject) => {
//         const consoleHandler = msg => {

//             if (msg.text() === '') { return }
//     
//             const text = msg.text()
//             console.log(`- Console message: ${text}, [${msg.location().url}]`)
//     
//             if (msg.location().url.match(/moz-extension.*\/ConsentEngine.js/g)) {
//                 let matches = (/CMP Detected: (?<cmpName>.*)/).exec(text)
//                 if (matches) {
//                     console.log(`- CMP found (${matches.groups.cmpName})`, worker)
//                     resolve('Found')
//                 } else {
//                     let matches = (/^(?<cmpName>.*) - (SAVE_CONSENT|HIDE_CMP|DO_CONSENT|OPEN_OPTIONS|Showing|isShowing\?)$/).exec(text)
//                     if (matches) {
//                         console.log('LOOKIE HEREEEEEEE matches:', matches)
//                         // if (matches.contains('SAVE_CONSENT')) {
//                         //     console.log
//                         // }
//                         console.log(`- CMP found (${matches.groups.cmpName})`, worker)
//                         resolve('Found')
//                     } else if (text.match(/No CMP detected in 5 seconds, stopping engine.*/g)) {
//                         resolve('Not Found')
//                     }
//                 }
//             }
//         }

//         page.on('console', consoleHandler)

//         setTimeout(() => {
//             console.log('Removing event listeners')
//             page.removeAllListeners('console')
//             resolve('Not Found')
//         }, 300000)
//     })
//     
// }


// // CLI entry point
// function main() {
//     const { program } = require('commander');
//     const default_crawler_args = [
//                     "--disable-setuid-sandbox",
//                     "--no-sandbox",
//                     '--enable-logging=stderr',
//                     '--enable-automation',
//                     //'--v=1'
//                     // '--disable-extensions-except=/app/node/consent-o-matic',
//                     // '--load-extension=/app/node/consent-o-matic',
//                 ];
//     const crawler_args = process.argv.slice(5);

//     program
//         .version('1.0.0');
//     program
//         .command("visit <URL> <uid>")
//         .option( '--headless <headless>', 'Which headless mode to run visiblev8', 'new')
//         .option( '--loiter-time <loiter_time>', 'Amount of time to loiter on a webpage', DEFAULT_LOITER_TIME)
//         .option( '--nav-time <nav_time>', 'Amount of time to wait for a page to load', DEFAULT_NAV_TIME)
//         .allowUnknownOption(true)
//         .description("Visit the given URL and store it under the UID, creating a page record and collecting all data")
//         .action(async function(input_url, uid, options) {
//             let combined_crawler_args = default_crawler_args.concat(crawler_args);
//             let show_log = false;
//             const user_data_dir = `/tmp/${uid}`;

//             if ( combined_crawler_args.includes( '--show-chrome-log' ) ) {
//                 show_log = true;
//                 combined_crawler_args = combined_crawler_args.filter( function( item ) {
//                     return item !== '--show-chrome-log';
//                 } );
//             }

//             if ( combined_crawler_args.includes( '--no-headless' ) ) {
//                 options.headless = false;
//                 combined_crawler_args = combined_crawler_args.filter( function( item ) {
//                     return item !== '--no-headless';
//                 } );
//             }

//             if ( combined_crawler_args.includes( '--no-screenshot' ) ) {
//                 options.disable_screenshots = true;
//                 combined_crawler_args = combined_crawler_args.filter( function( item ) {
//                     return item !== '--no-screenshot';
//                 } );
//             }

//             if ( show_log ) {
//                 console.log( `Using user data dir: ${user_data_dir}` );
//                 console.log(`Running chrome with, screenshot set to ${!options.disable_screenshots}, 
//                 headless set to ${options.headless} 
//                 and args: ${combined_crawler_args.join(' ')} to crawl ${input_url}`)
//             }

//             puppeteer.use(PuppeteerExtraPluginStealth());
//             const browser = await puppeteer.launch({
//                 headless: true,
//                 userDataDir: user_data_dir,
//                 dumpio: show_log,
//                 executablePath: '/opt/chromium.org/chromium/chrome',
//                 args: combined_crawler_args,
//                 timeout: 600 * 1000,
//                 protocolTimeout: 600 * 1000,
//             });

//             // await configureConsentOMatic(browser)

//             console.log('Launching new browser')

//             const page = await browser.newPage( { viewport: null } );
//             console.log('Created new page')
//             const har = new PuppeteerHar(page);
//             const url = new URL(input_url);
//             console.log('Visiting url: ' + url)
//             console.log(options)
//             try {
//                 await har.start({ path: `${uid}.har` });
//                 try{
//                     const navigationPromise = page.goto(url, {
//                         timeout: options.navTime * 1000,
//                         waitUntil: 'load'
//                     });
//                     // const consentBannerPromise = registerConsentBannerDetector(page)
//                     //Wait for the page to load and the consent banner to be triggered
//                     await Promise.all([ navigationPromise])
//                     console.log('Page load event is triggered')
//                     //Wait for any additional scripts to load
//                     await sleep(4000)
//                     await triggerEventHandlers(page)
//                     console.log('Triggered all events: ' + input_url)
//                     await sleep(options.loiterTime * 1000);
//                 } catch (ex) {
//                     if ( ex instanceof TimeoutError ) {
//                         console.log('TIMEOUT OCCURED WHILE VISITING: ' + url)
//                         // await sleep(options.loiterTime * 1000 * 2);
//                         throw ex;
//                     } else {
//                         console.log(`Error occured ${ex} while visiting: ` + url)
//                         throw ex;
//                     }
//                 }
//                 if ( !options.disable_screenshots )
//                     await page.screenshot({path: `./${uid}.png`, fullPage: true, timeout: 0 });

//                     
//             } catch (ex) {
//                 if (ex.message != 'Found or Not Found') {
//                     console.log(`FAILED CRAWL TO ${url}`)
//                     console.error(ex);
//                     process.exitCode = -1;
//                 }
//                 
//             }
//             console.log( 'Pid of browser process', browser.process().pid )
//             await har.stop()
//             await page.close();
//             await browser.close();
//             console.log(`Finished crawling, ${url} cleaning up...`);
//             // Throw away user data
//             await fs.promises.rm(user_data_dir, { recursive: true, force: true });
//             
//         });
//     program.parse(process.argv);
// }

// main();
