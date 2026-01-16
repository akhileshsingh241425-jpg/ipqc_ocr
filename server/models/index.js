const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// ========== IPQC Form Model ==========
const IPQCForm = sequelize.define('IPQCForm', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  checklist_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    comment: 'Unique identifier from original checklist'
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  time: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  shift: {
    type: DataTypes.ENUM('Day', 'Night'),
    allowNull: false
  },
  line: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  po_no: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'ocr_processed', 'edited', 'saved', 'exported'),
    defaultValue: 'pending'
  },
  ocr_processed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  saved_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  form_data: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Complete form data as JSON'
  },
  checkpoints_data: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'All checkpoint results as JSON array'
  },
  original_pdf_urls: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of original PDF URLs'
  },
  exported_pdf_path: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Path to exported PDF file'
  },
  exported_excel_path: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Path to exported Excel file'
  },
  created_by: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  updated_by: {
    type: DataTypes.STRING(100),
    allowNull: true
  }
}, {
  tableName: 'ipqc_forms',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['checklist_id'] },
    { fields: ['date'] },
    { fields: ['shift'] },
    { fields: ['line'] },
    { fields: ['status'] },
    { fields: ['date', 'shift', 'line'] }
  ]
});

// ========== Checkpoint Results Model ==========
const CheckpointResult = sequelize.define('CheckpointResult', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  form_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'ipqc_forms',
      key: 'id'
    }
  },
  sr_no: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  stage: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  checkpoint: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  quantum: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  frequency: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  criteria: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  result: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  sub_results: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Sub-results for checkpoints with multiple values'
  },
  remarks: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_ocr_filled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_manually_edited: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'checkpoint_results',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['form_id'] },
    { fields: ['sr_no'] },
    { fields: ['stage'] }
  ]
});

// ========== Activity Log Model ==========
const ActivityLog = sequelize.define('ActivityLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  form_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'ipqc_forms',
      key: 'id'
    }
  },
  action: {
    type: DataTypes.ENUM('created', 'ocr_processed', 'edited', 'saved', 'exported_pdf', 'exported_excel', 'deleted'),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  user: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  ip_address: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  old_data: {
    type: DataTypes.JSON,
    allowNull: true
  },
  new_data: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'activity_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { fields: ['form_id'] },
    { fields: ['action'] },
    { fields: ['created_at'] }
  ]
});

// ========== Relationships ==========
IPQCForm.hasMany(CheckpointResult, { foreignKey: 'form_id', as: 'checkpoints' });
CheckpointResult.belongsTo(IPQCForm, { foreignKey: 'form_id', as: 'form' });

IPQCForm.hasMany(ActivityLog, { foreignKey: 'form_id', as: 'activities' });
ActivityLog.belongsTo(IPQCForm, { foreignKey: 'form_id', as: 'form' });

module.exports = {
  IPQCForm,
  CheckpointResult,
  ActivityLog,
  sequelize
};
