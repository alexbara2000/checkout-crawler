const argv = require("minimist")(process.argv.slice(2));
const modules = argv["module"] === undefined ? ["default"] : argv["module"].split(",");
const task = argv["task"] === undefined ? "crawl" : argv["task"];
const crawlerTotal = argv["total"] === undefined ? 1 : parseInt(argv["total"], 10);
const crawlerId = argv["id"] === undefined ? 0 : parseInt(argv["id"], 10) % crawlerTotal;

const dbName = argv["dbName"]; //Usually set in module itself, but this option can override that
const dbHost = argv["dbHost"] === undefined ? "127.0.0.1" : argv["dbHost"];
const dbPort = argv["dbPort"] === undefined ? "3306" : argv["dbPort"];
const dbUser = argv["dbUser"] === undefined ? "root" : argv["dbUser"];
const dbPass = argv["dbPass"] === undefined ? "root" : argv["dbPass"];

const browser = argv["browser"] === undefined ? "chromium" : argv["browser"];

let config = {
    //General
    browser: browser,
    crawlerId: crawlerId,
    crawlerTotal: crawlerTotal,
    modules: modules,
    task: task,

    //Debugging
    freeze: argv["freeze"],
    gui: argv["gui"],
    url: argv["url"],

    //Timings
    loadTimeout: 30000,
    waitUntil: "load",

    //Database
    db: {
        host: dbHost,
        port: dbPort,
        name: dbName,
        user: dbUser,
        pass: dbPass,
        engine: "InnoDB",
        charset: "utf8mb4",
        collation: "utf8mb4_general_ci",
    },
};
module.exports = config;
