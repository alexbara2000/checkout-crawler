/* eslint-disable no-unused-vars */
(function () {
    function copyFlow(operations) {
        let copy = [];
        for (let i in operations) {
            copy.push({
                op: operations[i].operation,
                param1: operations[i].arguments[0] || "",
                param2: operations[i].arguments[1] || "",
                param3: operations[i].arguments[2] || "",
                location: operations[i].location
            });
        }
        return copy;
    }

    function copyTaint(taint) {
        let copy = [];
        for (let i in taint) {
            copy.push({
                begin: taint[i].begin, end: taint[i].end, operators: copyFlow(taint[i].flow)
            });
        }
        return copy;
    }

    function untaintObject(obj) {
        for (let index in obj) {
            if (obj.hasOwnProperty(index)) {
                if (typeof obj[index] === "string") {
                    obj[index].untaint();
                } else if (typeof obj[index] === "object") {
                    untaintObject(obj[index]);
                }
            }
        }
    }

    function createSources(taint) {
        let sources = [];
        for (let i in taint) {
            let flow = taint[i].flow;
            sources.push(flow[flow.length - 1].operation);
        }
        return sources;
    }

    // Return sa copy of a given finding - all properties enumerable
    function copyFinding(finding) {
        let copy = {
            "subframe": finding.subframe,
            "loc": finding.loc,
            "parentloc": finding.parentloc,
            "referrer": finding.referrer,
            "script": finding.stack.source,
            "line": finding.stack.line,
            "str": finding.str,
            "sink": finding.sink,
            "taint": finding.str.taint
        };

        //copy.taint = copyTaint(finding.str.taint);
        copy.sources = createSources(copy.taint);
        return copy;
    }

    // Event listener for Taintfox taint report
    window.addEventListener("__taintreport", (r) => {
        let finding = copyFinding(r.detail);
        finding.domain = location.hostname;
        // __crawler_log(finding);
        __crawler_taint_report(finding);
    });
})();
