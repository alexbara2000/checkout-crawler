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
    },
    crawler: {maxDepth: 3, maxLinks: 10, randomizeLinks: true, maxRetries: 2, sameSite: false, depthFirst: true,},
    seed: {list: "top1000Shopify_refined.csv", pageLimit: 100000},
};

module.exports = {
    options,
    initialize,
    seed,
    before,
    during,
    after,
};

async function seed() {
    await crawler.seed();
    await importer.csv({file: options.seed.list, limit: options.seed.pageLimit});
    await db.create(
        "checkout_links(" +
        "pid INT UNSIGNED NOT NULL, stage VARCHAR(10), fid INT UNSIGNED NOT NULL, links LONGTEXT, " +
        "INDEX(pid), INDEX(stage)" +
        ")"
    );
}

//Called every time the browser context is restarted
const flowHandler = common.readFile("snippets/flowHandler.js");
let findings = [];
let checkoutWasFound=false;

async function initialize() {
}

//Before visiting a new page from the crawling queue
async function before(params) {
    await browser.context().addInitScript(flowHandler);
    browser.context().exposeBinding("__crawler_taint_report", async function (source, value) {
        if (checkoutWasFound){
            let finding = await enhance_finding(value);
            // await send_finding(params, Object.assign({errored: params.error !== undefined }, finding));
            if (finding.taint){
                console.log(finding);
                await send_finding(params, Object.assign({errored: params.error !== undefined }, finding));
            }
            // findings.push(value);
        }
    });
}

//During the visit, after the page has loaded
async function during(params) {
    let foundCheckout = false;
    page = browser.page();
    await common.sleep(200);
    // let screenshot = await browser.page().screenshot();
    // fs.writeFileSync(`screenshots/page/${params.pid}-${params.host}.png`, Buffer.from(screenshot, "base64"));

    await selectSize(page, params);
    // await common.sleep(2000);
    let numAddedToCart = await addToCart(page, params, 0);
    if(numAddedToCart > 0) {
        foundCheckout = await goToCheckout(page, params, 0);
    }
    // await goToCheckout(page, params, 0);
    return {pageFound: foundCheckout};

}

//After the page was closed, useful for postprocessing and DB operations
async function after(params) {
    // for (let f of findings) {
    //     let finding = await enhance_finding(f);
    //     // await send_finding(params, Object.assign({errored: params.error !== undefined }, finding));
    //     if (finding.taint){
    //         // console.log(finding);
    //         await send_finding(params, Object.assign({errored: params.error !== undefined }, finding));
    //     }
    // }
    // console.log(`Exported ${findings.length} findings for ${params.protocol + params.host}`);
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


  async function selectSize(page, params){
    // let screenshot = await browser.page().screenshot();
    // fs.writeFileSync(`screenshots/page/${params.pid}-${params.host}.png`, Buffer.from(screenshot, "base64"));

    const addToCartKeywords = ['l', 'large', '10'];
    const xpathExpressions = addToCartKeywords.map(keyword => `//*[self::a or self::button or self::input or self::span or self::div or self::label]
        [
            translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 'abcdefghijklmnopqrstuvwxyz0123456789') = '${keyword.toLowerCase()}'
            or translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 'abcdefghijklmnopqrstuvwxyz0123456789') = '${keyword.toLowerCase()}'
        ]
        `);
    const originalUrl = page.url();
    console.log(originalUrl)

    var shouldLookAtMore=true;
    let j=0;
    for (const xpath of xpathExpressions) {
        // Get all nodes matching the XPath
        const nodes = await page.evaluate(({xpath, j}) => {
            const iterator = document.evaluate(xpath, document, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
            let node = iterator.iterateNext();
            const nodeArray = [];
            while (node) {
            nodeArray.push(node);
            node = iterator.iterateNext();
            }
            return nodeArray.map((node, index) => {
            // Create a unique selector for each node
            const uniqueSelector = `//*[@data-unique-id-size-${j}='${index}']`;
            node.setAttribute(`data-unique-id-size-${j}`, index);
            return uniqueSelector;
            });
        }, {xpath,j});
        console.log('Found nodes:', nodes);
        j++;


        // Click on each node and take a screenshot
        for (let i = 0; i < nodes.length; i++) {
            // Otherwise too many screenshots
            if(i >= 10 || !shouldLookAtMore){
                break;
            }
            const uniqueSelector = nodes[i];
            await page.evaluate(selector => {
            const node = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (node && node.click) {
                node.click();
            }
            }, uniqueSelector);

            await common.sleep(1000);

            // let screenshot = await browser.page().screenshot();
            // fs.writeFileSync(`screenshots/cart/${params.pid}-${params.host}-${i}.png`, Buffer.from(screenshot, "base64"));
            console.log(page.url());
            if(page.url())
            if (originalUrl !== page.url().split("&")[0] && originalUrl !== page.url().split("?")[0]) {
                await page.goBack();
                break;
            }
        }
        if(nodes.length > 0){
            shouldLookAtMore=false;
        }
    }
}

async function findClickableElements(page){
    const cartKeywords = ['cart', 'bag', 'shopping-cart', 'my-bag', 'basket'];
    const clickableElements = await page.evaluate((cartKeywords) => {
      const elements = Array.from(document.querySelectorAll(`a,span,button,div`));
      return elements
        .filter(element => {
          const text = element.textContent || '';
          const href = element.href || '';
          const onclick = element.getAttribute('onclick') || '';
          return cartKeywords.some(keyword =>
            text.includes(keyword) ||
            href.includes(keyword) ||
            onclick.includes(keyword)
          );
        })
        .map(element => ({
          tag: element.tagName.toLowerCase(),
          href: element.href || null,
          text: element.textContent.trim().length>= 100? '': element.textContent.trim(),
          onclick: element.getAttribute('onclick') || null,
          id: element.id
        }));
    }, cartKeywords);
    return clickableElements;
  }

async function viewCart(page, params){
    // let screenshot = await browser.page().screenshot();
    // fs.writeFileSync(`screenshots/page/${params.pid}-${params.host}.png`, Buffer.from(screenshot, "base64"));
    let foundCheckout = false;
    const originalUrl = page.url();
    const clickableElements = await findClickableElements(page)
    clickableElements.sort((a, b) => {
        const lengthA = a.href ? a.href.length : 0;
        const lengthB = b.href ? b.href.length: 0;
        return lengthA - lengthB;
      });

    seenUrls = [];
    let i=0;
    for (const elem of clickableElements) {
        if(elem.href != null && !seenUrls.includes(elem.href)){
            if (i>=4){
                break;
            }
            seenUrls.push(elem.href);
            await page.goto(elem.href);
            if (originalUrl !== page.url().split("&")[0] && originalUrl !== page.url().split("?")[0]) {
                i++;
                foundCheckout ||= await goToCheckout(page, params, 0);
                await page.goBack();
            }
        }
      }
      return foundCheckout;
}


async function addToCart(page, params, depth){
    // let screenshot = await browser.page().screenshot();
    // fs.writeFileSync(`screenshots/page/${params.pid}-${params.host}.png`, Buffer.from(screenshot, "base64"));

    const addToCartKeywords = ['add to cart', 'add to bag', 'add to basket', 'add to tote', 'add -'];
    const xpathExpressions = addToCartKeywords.map(keyword => `//*[self::a or self::button or self::input or self::span or self::div or self::label]
        [
            contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
            or contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
        ]
        `);
    const originalUrl = page.url();
    console.log(originalUrl)

    var shouldLookAtAdd=true;
    let j=0;
    let totalNodesFound=0;
    for (const xpath of xpathExpressions) {
        // Get all nodes matching the XPath
        const nodes = await page.evaluate(({xpath, j}) => {
            const iterator = document.evaluate(xpath, document, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
            let node = iterator.iterateNext();
            const nodeArray = [];
            while (node) {
            nodeArray.push(node);
            node = iterator.iterateNext();
            }
            return nodeArray.map((node, index) => {
            // Create a unique selector for each node
            const uniqueSelector = `//*[@data-unique-id-${j}='${index}']`;
            node.setAttribute(`data-unique-id-${j}`, index);
            return uniqueSelector;
            });
        }, {xpath,j});
        console.log('Found nodes:', nodes);
        totalNodesFound+=nodes.length;
        j++;

        // Click on each node and take a screenshot
        for (let i = 0; i < nodes.length; i++) {
            if (!shouldLookAtAdd){
                break;
            }
            // Otherwise too many screenshots
            if(i >= 10-(depth*5)){
                break;
            }
            const uniqueSelector = nodes[i];
            await page.evaluate(selector => {
            const node = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (node && node.click) {
                node.click();
            }
            }, uniqueSelector);

            await common.sleep(1000);

            // let screenshot = await browser.page().screenshot();
            // fs.writeFileSync(`screenshots/cart/${params.pid}-${params.host}-${i}.png`, Buffer.from(screenshot, "base64"));
            if (originalUrl !== page.url().split("&")[0] && originalUrl.split("?")[0]!== page.url().split("?")[0]) {
                if (depth == 0){
                    addToCart(page, params, 1);
                }
                // await goToCheckout(page, params);
                await page.goBack();
                if(page.url() == "about:blank"){
                    await page.goForward();
                }
                break;
            }
        }
        if (nodes.length > 0) {
            shouldLookAtAdd=false;
        }
    }
    return totalNodesFound;
}

async function goToCheckout(page, params, depth){
    // await common.sleep(4000);
    await common.sleep(2000);
    //removed buy now
    const checkoutKeywords = ["Checkout", "Check out", "Proceed", "Place Order", "Complete Purchase"];
    const xpathExpressions = checkoutKeywords.map(keyword => `//*[self::a or self::button or self::input or self::span or self::div or self::label]
    [
        contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
        or contains(translate(@aria-label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
        or contains(translate(@title, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
        or contains(translate(@alt, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
        or contains(translate(@id, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
        or contains(translate(@class, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
        or contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
    ]`);
    const originalUrl = page.url();
    console.log(originalUrl)
    let j=0;
    let nodesWithLengths=[];
    let foundCheckout = false;
    for (const xpath of xpathExpressions) {
        // Get all nodes matching the XPath
        const nodes = await page.evaluate(({xpath, j}) => {
            const iterator = document.evaluate(xpath, document, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
            let node = iterator.iterateNext();
            const nodeArray = [];
            while (node) {
            nodeArray.push(node);
            node = iterator.iterateNext();
            }
             // Function to get cumulative length of the relevant attributes
            const getLength = (node) => {
                const textLength = (node.textContent || '').trim().length;
                const ariaLabelLength = (node.getAttribute('aria-label') || '').trim().length;
                const titleLength = (node.getAttribute('title') || '').trim().length;
                const altLength = (node.getAttribute('alt') || '').trim().length;
                const idLength = (node.getAttribute('id') || '').trim().length;
                const classLength = (node.getAttribute('class') || '').trim().length;
                const valueLength = (node.getAttribute('value') || '').trim().length;

                return textLength + ariaLabelLength + titleLength + altLength + idLength + classLength + valueLength;
            };

            return nodeArray.map((node, index) => {
            // Create a unique selector for each node
            const uniqueSelector = `//*[@data-unique-id-ck-${j}='${index}']`;
            node.setAttribute(`data-unique-id-ck-${j}`, index);
            return [uniqueSelector, getLength(node)];
            });
        }, {xpath,j});
        j++;
        console.log('Found nodes:', nodes);
        nodesWithLengths=nodesWithLengths.concat(nodes);
    }
    nodesWithLengths.sort((a, b) => a[1] - b[1]);
    // Click on each node and take a screenshot
    for (let i = 0; i < nodesWithLengths.length; i++) {
        if(i >= 10){
            break;
        }
        const uniqueSelector = nodesWithLengths[i][0];
        await page.evaluate(selector => {
        const node = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        console.log(node)
        if (node && node.click) {
            node.click();
        }
        }, uniqueSelector);

        await common.sleep(3000);
        if (originalUrl !== page.url() && page.url() !== "https://" + params.host + "/" && page.url() !== "http://" + params.host + "/" && page.url() !== "about:blank") {
            foundCheckout=true;
            console.log(page.url());
            await common.sleep(3000);
            let screenshot = await browser.page().screenshot();
            fs.writeFileSync(`screenshots/checkout/size/${params.pid}-${params.host}-${i}.png`, Buffer.from(screenshot, "base64"));
            await markAsDone(params);
            checkoutWasFound=true;
            await triggerEventHandlers(page);
            if (depth == 0){
                await goToCheckout(page, params,1);
            }
            // await page.goBack();
            break;
        }
        // console.log(page.url());
        if(page.url() == "https://" + params.host + "/" || page.url() == "http://" + params.host + "/"){
            await page.goBack();
        }
        if(page.url() == "about:blank"){
            await page.goForward();
        }
    }
    return foundCheckout;
}

async function markAsDone(params){
    console.log("***")
    console.log(params.host)
    await db.query("UPDATE pages SET status = 1 WHERE status = 0 AND host = ?", [params.host]);
}