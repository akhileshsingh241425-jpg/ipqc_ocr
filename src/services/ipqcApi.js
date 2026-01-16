// ========== IPQC API Service ==========
// Handles all backend API calls for IPQC forms

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

class IPQCApiService {
  // ========== GET ALL FORMS ==========
  async getForms(filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.date) params.append('date', filters.date);
      if (filters.shift) params.append('shift', filters.shift);
      if (filters.line) params.append('line', filters.line);
      if (filters.status) params.append('status', filters.status);
      if (filters.page) params.append('page', filters.page);
      if (filters.limit) params.append('limit', filters.limit);
      
      const response = await fetch(`${API_BASE_URL}/forms?${params.toString()}`);
      const data = await response.json();
      
      if (!data.success) throw new Error(data.error);
      return data;
    } catch (error) {
      console.error('API Error - getForms:', error);
      throw error;
    }
  }

  // ========== GET FORM BY ID ==========
  async getFormById(id) {
    try {
      const response = await fetch(`${API_BASE_URL}/forms/${id}`);
      const data = await response.json();
      
      if (!data.success) throw new Error(data.error);
      return data.data;
    } catch (error) {
      console.error('API Error - getFormById:', error);
      throw error;
    }
  }

  // ========== GET FORM BY CHECKLIST ID ==========
  async getFormByChecklistId(checklistId) {
    try {
      const response = await fetch(`${API_BASE_URL}/forms/checklist/${encodeURIComponent(checklistId)}`);
      const data = await response.json();
      
      return data;
    } catch (error) {
      console.error('API Error - getFormByChecklistId:', error);
      throw error;
    }
  }

  // ========== CHECK IF FORM EXISTS ==========
  async checkFormExists(checklistId) {
    try {
      const response = await fetch(`${API_BASE_URL}/forms/status/${encodeURIComponent(checklistId)}`);
      const data = await response.json();
      
      return data;
    } catch (error) {
      console.error('API Error - checkFormExists:', error);
      return { exists: false, processed: false, saved: false };
    }
  }

  // ========== BULK GET STATUS ==========
  async getBulkStatus(checklistIds) {
    try {
      const response = await fetch(`${API_BASE_URL}/forms/bulk-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist_ids: checklistIds })
      });
      const data = await response.json();
      
      if (!data.success) throw new Error(data.error);
      return data.data;
    } catch (error) {
      console.error('API Error - getBulkStatus:', error);
      return {};
    }
  }

  // ========== CREATE NEW FORM ==========
  async createForm(formData) {
    try {
      const response = await fetch(`${API_BASE_URL}/forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await response.json();
      
      if (!data.success) throw new Error(data.error);
      return data.data;
    } catch (error) {
      console.error('API Error - createForm:', error);
      throw error;
    }
  }

  // ========== UPDATE FORM ==========
  async updateForm(id, formData) {
    try {
      const response = await fetch(`${API_BASE_URL}/forms/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await response.json();
      
      if (!data.success) throw new Error(data.error);
      return data.data;
    } catch (error) {
      console.error('API Error - updateForm:', error);
      throw error;
    }
  }

  // ========== SAVE FORM (Create or Update by Checklist ID) ==========
  async saveForm(checklistInfo, formData, checkpointsData, pdfUrls = []) {
    try {
      const payload = {
        checklist_id: checklistInfo.checklistId || checklistInfo.checklist_id,
        date: checklistInfo.date,
        time: checklistInfo.time || formData.time,
        shift: checklistInfo.shift,
        line: checklistInfo.line,
        po_no: formData.poNo || checklistInfo.line,
        form_data: formData,
        checkpoints_data: checkpointsData || formData.checkpoints,
        original_pdf_urls: pdfUrls
      };
      
      const response = await fetch(`${API_BASE_URL}/forms/save-by-checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      
      if (!data.success) throw new Error(data.error);
      return data;
    } catch (error) {
      console.error('API Error - saveForm:', error);
      throw error;
    }
  }

  // ========== MARK AS OCR PROCESSED ==========
  async markOcrProcessed(id) {
    try {
      const response = await fetch(`${API_BASE_URL}/forms/${id}/ocr-processed`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (!data.success) throw new Error(data.error);
      return data.data;
    } catch (error) {
      console.error('API Error - markOcrProcessed:', error);
      throw error;
    }
  }

  // ========== DELETE FORM ==========
  async deleteForm(id) {
    try {
      const response = await fetch(`${API_BASE_URL}/forms/${id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      
      if (!data.success) throw new Error(data.error);
      return data;
    } catch (error) {
      console.error('API Error - deleteForm:', error);
      throw error;
    }
  }

  // ========== HEALTH CHECK ==========
  async healthCheck() {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      const data = await response.json();
      return data.status === 'OK';
    } catch (error) {
      console.error('API Health Check Failed:', error);
      return false;
    }
  }
}

// Export singleton instance
const ipqcApi = new IPQCApiService();
export default ipqcApi;
