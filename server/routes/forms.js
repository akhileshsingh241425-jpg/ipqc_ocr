const express = require('express');
const router = express.Router();
const { IPQCForm, CheckpointResult, ActivityLog } = require('../models');
const { Op } = require('sequelize');

// ========== GET ALL FORMS ==========
// GET /api/forms?date=2024-01-01&shift=Day&line=Line1&status=saved
router.get('/', async (req, res) => {
  try {
    const { date, shift, line, status, page = 1, limit = 50 } = req.query;
    
    // Build filter conditions
    const where = {};
    if (date) where.date = date;
    if (shift) where.shift = shift;
    if (line) where.line = line;
    if (status) where.status = status;
    
    const offset = (page - 1) * limit;
    
    const { count, rows } = await IPQCForm.findAndCountAll({
      where,
      order: [['date', 'DESC'], ['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching forms:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== GET SINGLE FORM BY ID ==========
router.get('/:id', async (req, res) => {
  try {
    const form = await IPQCForm.findByPk(req.params.id, {
      include: [{ model: CheckpointResult, as: 'checkpoints' }]
    });
    
    if (!form) {
      return res.status(404).json({ success: false, error: 'Form not found' });
    }
    
    res.json({ success: true, data: form });
  } catch (error) {
    console.error('Error fetching form:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== GET FORM BY CHECKLIST ID ==========
router.get('/checklist/:checklistId', async (req, res) => {
  try {
    const form = await IPQCForm.findOne({
      where: { checklist_id: req.params.checklistId },
      include: [{ model: CheckpointResult, as: 'checkpoints' }]
    });
    
    if (!form) {
      return res.status(404).json({ success: false, error: 'Form not found', exists: false });
    }
    
    res.json({ success: true, data: form, exists: true });
  } catch (error) {
    console.error('Error fetching form by checklist ID:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== CREATE NEW FORM ==========
router.post('/', async (req, res) => {
  try {
    const {
      checklist_id,
      date,
      time,
      shift,
      line,
      po_no,
      form_data,
      checkpoints_data,
      original_pdf_urls,
      status = 'pending'
    } = req.body;
    
    // Check if form already exists
    const existingForm = await IPQCForm.findOne({ where: { checklist_id } });
    if (existingForm) {
      return res.status(400).json({ 
        success: false, 
        error: 'Form with this checklist ID already exists',
        existing_id: existingForm.id
      });
    }
    
    // Create form
    const form = await IPQCForm.create({
      checklist_id,
      date,
      time,
      shift,
      line,
      po_no,
      form_data,
      checkpoints_data,
      original_pdf_urls,
      status
    });
    
    // Log activity
    await ActivityLog.create({
      form_id: form.id,
      action: 'created',
      description: `Form created for ${line} - ${shift} shift on ${date}`,
      ip_address: req.ip
    });
    
    res.status(201).json({ success: true, data: form });
  } catch (error) {
    console.error('Error creating form:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== UPDATE FORM (SAVE EDITED DATA) ==========
router.put('/:id', async (req, res) => {
  try {
    const form = await IPQCForm.findByPk(req.params.id);
    
    if (!form) {
      return res.status(404).json({ success: false, error: 'Form not found' });
    }
    
    const oldData = form.toJSON();
    
    const {
      date,
      time,
      shift,
      line,
      po_no,
      form_data,
      checkpoints_data,
      status
    } = req.body;
    
    // Update form
    await form.update({
      date: date || form.date,
      time: time || form.time,
      shift: shift || form.shift,
      line: line || form.line,
      po_no: po_no || form.po_no,
      form_data: form_data || form.form_data,
      checkpoints_data: checkpoints_data || form.checkpoints_data,
      status: status || 'edited',
      saved_at: new Date()
    });
    
    // Log activity
    await ActivityLog.create({
      form_id: form.id,
      action: 'edited',
      description: `Form edited for ${form.line} - ${form.shift} shift`,
      ip_address: req.ip,
      old_data: oldData,
      new_data: form.toJSON()
    });
    
    res.json({ success: true, data: form, message: 'Form updated successfully' });
  } catch (error) {
    console.error('Error updating form:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== SAVE FORM (Mark as Saved) ==========
router.post('/:id/save', async (req, res) => {
  try {
    const form = await IPQCForm.findByPk(req.params.id);
    
    if (!form) {
      return res.status(404).json({ success: false, error: 'Form not found' });
    }
    
    const { form_data, checkpoints_data } = req.body;
    
    await form.update({
      form_data: form_data || form.form_data,
      checkpoints_data: checkpoints_data || form.checkpoints_data,
      status: 'saved',
      saved_at: new Date()
    });
    
    // Log activity
    await ActivityLog.create({
      form_id: form.id,
      action: 'saved',
      description: `Form saved for ${form.line} - ${form.shift} shift`,
      ip_address: req.ip
    });
    
    res.json({ success: true, data: form, message: 'Form saved successfully' });
  } catch (error) {
    console.error('Error saving form:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== SAVE OR UPDATE FORM BY CHECKLIST ID ==========
router.post('/save-by-checklist', async (req, res) => {
  try {
    const {
      checklist_id,
      date,
      time,
      shift,
      line,
      po_no,
      form_data,
      checkpoints_data,
      original_pdf_urls
    } = req.body;
    
    if (!checklist_id) {
      return res.status(400).json({ success: false, error: 'checklist_id is required' });
    }
    
    // Find existing or create new
    let form = await IPQCForm.findOne({ where: { checklist_id } });
    let isNew = false;
    
    if (form) {
      // Update existing
      await form.update({
        date: date || form.date,
        time: time || form.time,
        shift: shift || form.shift,
        line: line || form.line,
        po_no: po_no || form.po_no,
        form_data,
        checkpoints_data,
        original_pdf_urls: original_pdf_urls || form.original_pdf_urls,
        status: 'saved',
        saved_at: new Date()
      });
    } else {
      // Create new
      form = await IPQCForm.create({
        checklist_id,
        date,
        time,
        shift,
        line,
        po_no,
        form_data,
        checkpoints_data,
        original_pdf_urls,
        status: 'saved',
        saved_at: new Date()
      });
      isNew = true;
    }
    
    // Log activity
    await ActivityLog.create({
      form_id: form.id,
      action: isNew ? 'created' : 'saved',
      description: `Form ${isNew ? 'created and ' : ''}saved for ${line} - ${shift} shift on ${date}`,
      ip_address: req.ip
    });
    
    res.json({ 
      success: true, 
      data: form, 
      message: isNew ? 'Form created and saved' : 'Form updated and saved',
      isNew 
    });
  } catch (error) {
    console.error('Error saving form:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== MARK AS OCR PROCESSED ==========
router.post('/:id/ocr-processed', async (req, res) => {
  try {
    const form = await IPQCForm.findByPk(req.params.id);
    
    if (!form) {
      return res.status(404).json({ success: false, error: 'Form not found' });
    }
    
    await form.update({
      status: 'ocr_processed',
      ocr_processed_at: new Date()
    });
    
    // Log activity
    await ActivityLog.create({
      form_id: form.id,
      action: 'ocr_processed',
      description: `OCR processing completed for ${form.line} - ${form.shift} shift`,
      ip_address: req.ip
    });
    
    res.json({ success: true, data: form, message: 'Marked as OCR processed' });
  } catch (error) {
    console.error('Error marking OCR processed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== DELETE FORM ==========
router.delete('/:id', async (req, res) => {
  try {
    const form = await IPQCForm.findByPk(req.params.id);
    
    if (!form) {
      return res.status(404).json({ success: false, error: 'Form not found' });
    }
    
    const formInfo = form.toJSON();
    
    // Delete related checkpoint results first
    await CheckpointResult.destroy({ where: { form_id: form.id } });
    
    // Log activity before deleting
    await ActivityLog.create({
      form_id: null, // Form will be deleted
      action: 'deleted',
      description: `Form deleted for ${form.line} - ${form.shift} shift on ${form.date}`,
      ip_address: req.ip,
      old_data: formInfo
    });
    
    await form.destroy();
    
    res.json({ success: true, message: 'Form deleted successfully' });
  } catch (error) {
    console.error('Error deleting form:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== GET FORM STATUS (for table display) ==========
router.get('/status/:checklistId', async (req, res) => {
  try {
    const form = await IPQCForm.findOne({
      where: { checklist_id: req.params.checklistId },
      attributes: ['id', 'status', 'ocr_processed_at', 'saved_at', 'created_at']
    });
    
    if (!form) {
      return res.json({ 
        success: true, 
        exists: false,
        status: 'pending',
        processed: false,
        saved: false
      });
    }
    
    res.json({ 
      success: true, 
      exists: true,
      status: form.status,
      processed: ['ocr_processed', 'edited', 'saved', 'exported'].includes(form.status),
      saved: ['saved', 'exported'].includes(form.status),
      ocr_processed_at: form.ocr_processed_at,
      saved_at: form.saved_at
    });
  } catch (error) {
    console.error('Error getting form status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== BULK GET STATUS ==========
router.post('/bulk-status', async (req, res) => {
  try {
    const { checklist_ids } = req.body;
    
    if (!Array.isArray(checklist_ids)) {
      return res.status(400).json({ success: false, error: 'checklist_ids must be an array' });
    }
    
    const forms = await IPQCForm.findAll({
      where: { checklist_id: { [Op.in]: checklist_ids } },
      attributes: ['checklist_id', 'status', 'ocr_processed_at', 'saved_at']
    });
    
    // Create status map
    const statusMap = {};
    forms.forEach(form => {
      statusMap[form.checklist_id] = {
        exists: true,
        status: form.status,
        processed: ['ocr_processed', 'edited', 'saved', 'exported'].includes(form.status),
        saved: ['saved', 'exported'].includes(form.status),
        ocr_processed_at: form.ocr_processed_at,
        saved_at: form.saved_at
      };
    });
    
    // Add missing checklist IDs as pending
    checklist_ids.forEach(id => {
      if (!statusMap[id]) {
        statusMap[id] = {
          exists: false,
          status: 'pending',
          processed: false,
          saved: false
        };
      }
    });
    
    res.json({ success: true, data: statusMap });
  } catch (error) {
    console.error('Error getting bulk status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
