import express from 'express';

import { protect } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { validate, loginSchema, registerSchema, forgotPasswordSchema, changePasswordSchema, resetPasswordSchema } from '../middleware/validate.middleware.js';

const router = express.Router();


import authController from '../controllers/auth.controller.js';
const { register, login, logout, refresh, forgotPassword, resetPassword, changePassword, getMe, updateMe, googleAuth } = authController;

// public — rate-limited + validated
router.post("/register",        authLimiter, validate(registerSchema),        authController.register);
router.post("/login",           authLimiter, validate(loginSchema),           authController.login);
router.post("/refresh",         authLimiter,                                  authController.refresh);
router.post("/forgot-password", authLimiter, validate(forgotPasswordSchema),  authController.forgotPassword);
router.post("/reset-password",  authLimiter, validate(resetPasswordSchema),   authController.resetPassword);

// protected
router.post("/logout",           protect, authController.logout);
router.patch("/change-password", protect, validate(changePasswordSchema), authController.changePassword);
router.get("/me",               protect, getMe);
router.patch("/me",             protect, updateMe);

//Google OAuth login
router.post('/google', googleAuth);


export default router;

