import express from 'express';

const router = express.Router();

import authRoutes         from './auth.routes.js';
import courseRoutes       from './course.routes.js';
import sessionRoutes      from './session.routes.js';
import tutorRoutes        from './tutor.routes.js';
import notificationRoutes from './notification.routes.js';
import paymentRoutes      from './payment.routes.js';
import adminRoutes        from './admin.routes.js';
import studentRoutes      from './student.routes.js';
import OnboardingRoutes   from './Onboarding.routes.js';
import faqRoutes          from './faq.routes.js';
import contactRoutes      from './contact.routes.js';
import supportRoutes      from './support.routes.js';
import moduleRoutes        from './module.routes.js';
import manageModulesRoutes from './manage-modules.routes.js';
import managePlansRoutes   from './manage-plans.routes.js';
import publicContentRoutes  from './public-content.routes.js';
import enrollmentsRoutes    from './enrollments.routes.js';
import messageRoutes         from './message.routes.js';
import helpChatRoutes       from './helpChat.routes.js';

router.use('/auth',          authRoutes);
router.use('/courses',       courseRoutes);
router.use('/sessions',      sessionRoutes);
router.use('/students',      studentRoutes);
router.use('/tutors',        tutorRoutes);
router.use('/notifications', notificationRoutes);
router.use('/payments',      paymentRoutes);
router.use('/admin',         adminRoutes);
router.use('/onboarding',    OnboardingRoutes);
router.use('/faqs',            faqRoutes);
router.use('/contact',         contactRoutes);
router.use('/support/tickets', supportRoutes);
router.use('/modules',              moduleRoutes);
router.use('/admin/manage/modules', manageModulesRoutes);
router.use('/admin/manage/plans',   managePlansRoutes);
router.use('/public',               publicContentRoutes);
router.use('/enrollments',          enrollmentsRoutes);
router.use('/messages',             messageRoutes);
router.use('/help-chat',            helpChatRoutes);

router.use('/', (req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' })
})

export default router;
