const express = require('express');
const morgan = require('morgan');
const {job_scheduler_authentication} = require('./middleware/api_auth');
const {exec_external_program} = require('./utils/job_scheduler');

require('dotenv').config();
const app = express();

app.use(morgan('dev'));

/* Test to see if we can get an endpoint to fire off an external program. */
app.get('/get-printers', job_scheduler_authentication, async (req, res) => {
    try {
        const stdout = await exec_external_program('C:\\Users\\Darien\\Desktop\\Git_Repos\\Seller-Central-Label-Printing-Automation',
            'npm', ['run', 'print', '--', '--printers']);
        res.status(200).send({stdout});
    } catch (error) {
        res.status(400).send({error: 'Program failed'});
    }
});

app.get('/dry-print', job_scheduler_authentication, async (req, res) => {
    try {
        const stdout = await exec_external_program('C:\\Users\\Darien\\Desktop\\Git_Repos\\Seller-Central-Label-Printing-Automation',
            'npm', ['run', 'print', '--', '--printers']);
        res.status(200).send({stdout});
    } catch (error) {
        res.status(400).send({error: 'Program failed'});
    }
})

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`App is listening on port ${PORT}`);
})