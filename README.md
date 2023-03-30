# Accept All Exploits: Exploring the Security Impact of Cookie Banners

This repository contains the accompanying materials for the paper **Accept All Exploits: Exploring the Security Impact of Cookie Banners** by [David Klein](https://www.tu-braunschweig.de/en/ias/staff/david-klein), [Marius Musch](https://www.tu-braunschweig.de/ias/staff/marius-musch), [Thomas Barber](https://www.linkedin.com/in/thomas-barber-b3965551/), Moritz Kopmann, and [Martin Johns](https://www.tu-braunschweig.de/en/ias/staff/martin-johns).

## Cite us!
```bibtex
@inproceedings{klein2022accept,
  title={Accept All Exploits: Exploring the Security Impact of Cookie Banners},
  author={Klein, David and Musch, Marius and Barber, Thomas and Kopmann, Moritz and Johns, Martin},
  booktitle={Proceedings of the 38th Annual Computer Security Applications Conference},
  year={2022}
}
```

## Get in touch
If you have any questions please do not hesitate to [contact us](mailto:david.klein@tu-braunschweig.de) :)

---

## Installation
- Dependencies
    - Requires MySQL server running somewhere
    - Install the rest with `npm install`
- Configuration
    - Edit `config.js` to set SQL server, username, and password
- Playwright URL encoding patch
    - `cd patches; ./apply.sh`
- Tainting browser
    - Clone https://github.com/SAP/project-foxhound into your home folder and build it
    - Taint reports will be sent to `localhost:3000` and need to be collected there, e.g. sent to a NoSQL database

## Usage
```bash
# Fill database with entries from `lists/eu.csv`
node main.js --module=cookies,tainting --task=seed

# Crawl with one browser instance
FOXHOUND_PATH=~/project-foxhound/obj-build-playwright/dist/bin/firefox node main.js --browser=foxhound --module=cookies,tainting --task=crawl

# Crawl with 8 browsers in parallel
FOXHOUND_PATH=~/project-foxhound/obj-build-playwright/dist/bin/firefox ./startup.sh "cookies,tainting" crawl foxhound 9
```
