const express = require('express');
const morgan = require('morgan');
const path = require('path');
const {job_scheduler_authentication} = require('./middleware/api_auth');
const {exec_external_program} = require('./utils/job_scheduler');
const {validateLabelRequests, ValidationError} = require('./utils/validate_label_requests');
const {writeProductsFile} = require('./utils/write_products_file');

require('dotenv').config();
const app = express();

app.use(morgan('dev'));
app.use(express.json({limit: '1mb'}));

/* Both dry and real print runs launch a full Playwright session and fetch
    (or print) one label per SKU (see Seller-Central-Label-Printing-Automation's
    printLabels.ts and its REQUEST_PACING_MS) -- the default 15s exec timeout
    isn't close to enough for that, so these routes get their own longer
    budget. */
const PRINT_TIMEOUT_MS = 120000;

/* Test to see if we can get an endpoint to fire off an external program. */
app.get('/get-printers', job_scheduler_authentication, async (req, res) => {
    const PRINT_LABEL_WORKFLOW_PATH = process.env.PRINT_LABEL_WORKFLOW_ABSOLUTE_PATH;
    try {
        const stdout = await exec_external_program(PRINT_LABEL_WORKFLOW_PATH,
            'npm', ['run', 'print', '--', '--printers']);
        res.status(200).send({stdout});
    } catch (error) {
        res.status(400).send({error: 'Program failed'});
    }
});

/* Accepts a JSON array of { sku, quantity } label requests, overwrites the
    print-label workflow's data/products.json with them, then runs that
    workflow's CLI (relaying its structured --json results back). In dry-run
    mode the CLI downloads the label PDFs and never sends them to a physical
    printer; shared by both /dry-print and /print below, which differ only in
    that flag. */
async function handlePrintRequest(req, res, {dryRun}) {
    const PRINT_LABEL_WORKFLOW_PATH = process.env.PRINT_LABEL_WORKFLOW_ABSOLUTE_PATH;
    if (!PRINT_LABEL_WORKFLOW_PATH) {
        const error = 'Server misconfigured: PRINT_LABEL_WORKFLOW_ABSOLUTE_PATH is not set.';
        console.error(error);
        return res.status(500).send({error});
    }

    let requests;
    try {
        requests = validateLabelRequests(req.body);
    } catch (error) {
        if (error instanceof ValidationError) {
            return res.status(400).send({error: error.message, details: error.details});
        }
        throw error;
    }

    const productsPath = path.join(PRINT_LABEL_WORKFLOW_PATH, 'data', 'products.json');

    try {
        await writeProductsFile(productsPath, requests);
    } catch (error) {
        console.error(`Failed to write ${productsPath}:`, error.message);
        return res.status(500).send({error: 'Failed to write products.json'});
    }

    const cliArgs = ['run', 'print', '--', '--file', 'data/products.json', '--json'];
    if (dryRun) {
        cliArgs.splice(cliArgs.length - 1, 0, '--dry-run');
    }

    try {
        const stdout = await exec_external_program(
            PRINT_LABEL_WORKFLOW_PATH,
            'npm',
            cliArgs,
            {timeoutMs: PRINT_TIMEOUT_MS}
        );

        try {
            res.status(200).send({results: JSON.parse(stdout)});
        } catch {
            /* --json should always emit parseable JSON on success; fall back to
                raw stdout rather than hiding it if that assumption ever breaks. */
            res.status(200).send({stdout});
        }
    } catch (error) {
        res.status(400).send({error: 'Program failed'});
    }
}

app.post('/dry-print', job_scheduler_authentication, (req, res) => handlePrintRequest(req, res, {dryRun: true}));

/* Same as /dry-print but without --dry-run -- this actually sends labels to
    the physical printer. Gated by the same bearer-key auth; callers are
    expected to add their own confirmation step before hitting this, since
    unlike the dry run it can't be undone. */
app.post('/print', job_scheduler_authentication, (req, res) => handlePrintRequest(req, res, {dryRun: false}));

/* Catches express.json()'s SyntaxError for malformed JSON bodies so callers
    get a clean 400 instead of Express's default HTML error page. Must be
    registered after the routes above (Express matches error middleware by
    arity + position). */
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).send({error: 'Malformed JSON in request body.'});
    }
    next(err);
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`App is listening on port ${PORT}`);
})
