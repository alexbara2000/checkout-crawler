// const {chromium} = require('playwright');
const { chromium } = require('playwright-extra')
const stealth = require('puppeteer-extra-plugin-stealth')()

async function initialize(sharedConfig) {
    const chrome_config = {};
    chromium.use(stealth)
    return await chromium.launch(Object.assign(chrome_config, sharedConfig));
}

module.exports = {
    initialize,
};
