import { prisma } from '../config/db.js'
import { getIO } from '../config/socket.js'

const timers = new Map()
const INACTIVITY_MS = 15 * 60 * 1000 // 15 minutes

export function resetTimer(chatId) {
  clearTimer(chatId)
  const t = setTimeout(() => closeByInactivity(chatId), INACTIVITY_MS)
  timers.set(chatId, t)
}

export function clearTimer(chatId) {
  if (timers.has(chatId)) {
    clearTimeout(timers.get(chatId))
    timers.delete(chatId)
  }
}

async function closeByInactivity(chatId) {
  timers.delete(chatId)
  try {
    const chat = await prisma.helpChat.findUnique({ where: { id: chatId } })
    if (!chat || chat.status !== 'active') return

    await prisma.helpChat.update({
      where: { id: chatId },
      data: { status: 'closed', closed_at: new Date(), updated_at: new Date() },
    })

    const io = getIO()
    io.to(chat.requester_id).emit('helpChat:closed', { chatId, reason: 'inactivity' })
    if (chat.admin_id) {
      io.to(chat.admin_id).emit('helpChat:closed', { chatId, reason: 'inactivity' })
    }
  } catch (e) {
    console.error('helpChat inactivity close error:', e)
  }
}
