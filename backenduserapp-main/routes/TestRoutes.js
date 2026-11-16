const express = require('express');
const router = express.Router();
const Test = require('../controllers/TestSignup');

router.post('/Tsignup', Test.TsignUp);


module.exports = router;