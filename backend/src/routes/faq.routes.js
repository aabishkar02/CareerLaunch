import { Router } from 'express'
import { protect, authorize } from '../middleware/auth.middleware.js'
import { getFaqs, adminGetFaqs, createFaq, updateFaq, deleteFaq } from '../controllers/faq.controller.js'

const router = Router()
const admin  = [protect, authorize('admin')]

router.get('/',            getFaqs)
router.get('/admin',      ...admin, adminGetFaqs)
router.post('/',          ...admin, createFaq)
router.patch('/:id',      ...admin, updateFaq)
router.put('/:id',        ...admin, updateFaq)   // PUT alias for frontend compatibility
router.delete('/:id',     ...admin, deleteFaq)

export default router
