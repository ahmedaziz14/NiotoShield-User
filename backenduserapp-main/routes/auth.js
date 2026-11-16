const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const TestSignup = require('../controllers/TestSignup') ; 
router.post('/signup', TestSignup.TsignUp);
router.post('/login', authController. signIn);
router.post('/logout', authController. signOut);

module.exports = router;