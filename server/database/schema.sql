-- =====================================================
-- IPQC Form Database Schema
-- Database: MySQL / MariaDB
-- =====================================================

-- Create Database
CREATE DATABASE IF NOT EXISTS ipqc_db
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE ipqc_db;

-- =====================================================
-- Table: ipqc_forms
-- Main table to store IPQC form data
-- =====================================================
CREATE TABLE IF NOT EXISTS ipqc_forms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    checklist_id VARCHAR(100) NOT NULL UNIQUE COMMENT 'Unique identifier from original checklist',
    date DATE NOT NULL,
    time VARCHAR(20),
    shift ENUM('Day', 'Night') NOT NULL,
    line VARCHAR(50) NOT NULL,
    po_no VARCHAR(100),
    status ENUM('pending', 'ocr_processed', 'edited', 'saved', 'exported') DEFAULT 'pending',
    ocr_processed_at DATETIME,
    saved_at DATETIME,
    form_data JSON COMMENT 'Complete form data as JSON',
    checkpoints_data JSON COMMENT 'All checkpoint results as JSON array',
    original_pdf_urls JSON COMMENT 'Array of original PDF URLs',
    exported_pdf_path VARCHAR(500) COMMENT 'Path to exported PDF file',
    exported_excel_path VARCHAR(500) COMMENT 'Path to exported Excel file',
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_checklist_id (checklist_id),
    INDEX idx_date (date),
    INDEX idx_shift (shift),
    INDEX idx_line (line),
    INDEX idx_status (status),
    INDEX idx_date_shift_line (date, shift, line)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Table: checkpoint_results
-- Detailed checkpoint results (optional, for granular queries)
-- =====================================================
CREATE TABLE IF NOT EXISTS checkpoint_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    form_id INT NOT NULL,
    sr_no INT NOT NULL,
    stage VARCHAR(100) NOT NULL,
    checkpoint VARCHAR(255) NOT NULL,
    quantum VARCHAR(100),
    frequency VARCHAR(100),
    criteria TEXT,
    result VARCHAR(255),
    sub_results JSON COMMENT 'Sub-results for checkpoints with multiple values',
    remarks TEXT,
    is_ocr_filled BOOLEAN DEFAULT FALSE,
    is_manually_edited BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (form_id) REFERENCES ipqc_forms(id) ON DELETE CASCADE,
    INDEX idx_form_id (form_id),
    INDEX idx_sr_no (sr_no),
    INDEX idx_stage (stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Table: activity_logs
-- Track all actions on forms
-- =====================================================
CREATE TABLE IF NOT EXISTS activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    form_id INT,
    action ENUM('created', 'ocr_processed', 'edited', 'saved', 'exported_pdf', 'exported_excel', 'deleted') NOT NULL,
    description TEXT,
    user VARCHAR(100),
    ip_address VARCHAR(50),
    old_data JSON,
    new_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (form_id) REFERENCES ipqc_forms(id) ON DELETE SET NULL,
    INDEX idx_form_id (form_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Sample Query: Get all saved forms for today
-- =====================================================
-- SELECT * FROM ipqc_forms 
-- WHERE date = CURDATE() AND status = 'saved'
-- ORDER BY created_at DESC;

-- =====================================================
-- Sample Query: Get form with checkpoints
-- =====================================================
-- SELECT f.*, c.* 
-- FROM ipqc_forms f
-- LEFT JOIN checkpoint_results c ON f.id = c.form_id
-- WHERE f.checklist_id = 'your_checklist_id';
