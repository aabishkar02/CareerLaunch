import { prisma } from '../config/db.js'

export async function getEmailTemplates(req, res) {
  const templates = await prisma.emailTemplate.findMany({
    orderBy: { key: 'asc' },
    include: { updater: { select: { first_name: true, last_name: true } } },
  })
  res.json({ data: templates })
}

export async function getEmailTemplate(req, res) {
  const { key } = req.params
  const template = await prisma.emailTemplate.findUnique({
    where: { key },
    include: { updater: { select: { first_name: true, last_name: true } } },
  })
  if (!template) return res.status(404).json({ error: 'Template not found' })
  res.json({ data: template })
}

export async function updateEmailTemplate(req, res) {
  const { key } = req.params
  const { name, subject, preheader, heading, intro, steps, cta_label } = req.body

  const existing = await prisma.emailTemplate.findUnique({ where: { key } })
  if (!existing) return res.status(404).json({ error: 'Template not found' })

  const updated = await prisma.emailTemplate.update({
    where: { key },
    data: {
      ...(name       != null && { name }),
      ...(subject    != null && { subject }),
      ...(preheader  !== undefined && { preheader }),
      ...(heading    != null && { heading }),
      ...(intro      != null && { intro }),
      ...(steps      != null && { steps }),
      ...(cta_label  != null && { cta_label }),
      updated_by: req.user.id,
    },
    include: { updater: { select: { first_name: true, last_name: true } } },
  })

  res.json({ data: updated })
}
