import { Router } from 'express'
import { protect, authorize } from '../middleware/auth.middleware.js'
import { submitContact, getContacts, updateContactStatus, deleteContact } from '../controllers/contact.controller.js'

const router = Router()
const admin  = [protect, authorize('admin')]

router.post('/',           submitContact)
router.get('/admin',      ...admin, getContacts)
router.patch('/:id',      ...admin, updateContactStatus)
router.delete('/:id',     ...admin, deleteContact)

export default router
