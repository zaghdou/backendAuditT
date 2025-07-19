"use client";

// React Imports
import { useState } from 'react';

// MUI Imports
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';

// Styled Component Imports
import AppReactDatepicker from '@/libs/styles/AppReactDatepicker';

type ReportFormData = {
  type: 'ISAE3702/SOC 1' | 'SOC 2' | '';
  nature: string;
  startDate: Date | null;
  endDate: Date | null;
  auditSubject: string;
  status: 'Active' | 'Inactive' | 'Pending' | '';
};

const AddReportForm = () => {
  // State for form data
  const [formData, setFormData] = useState<ReportFormData>({
    type: '',
    nature: '',
    startDate: null,
    endDate: null,
    auditSubject: '',
    status: '',
  });

  // Handle form field changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle date changes
  const handleDateChange = (name: 'startDate' | 'endDate') => (date: Date | null) => {
    setFormData(prev => ({ ...prev, [name]: date }));
  };

  // Handle form submission
  const handleSubmit = () => {
    console.log('Submitting report:', formData);
    // Placeholder: Implement backend POST request when available
  };

  // Handle form reset
  const handleReset = () => {
    setFormData({
      type: '',
      nature: '',
      startDate: null,
      endDate: null,
      auditSubject: '',
      status: '',
    });
    console.log('Form reset');
  };

  return (
    <Card sx={{ maxWidth: 600, mx: 'auto', mt: 4, p: 2 }}>
      <CardContent>
        <Typography variant="h5" gutterBottom>
          Add Report
        </Typography>
        <FormControl fullWidth margin="normal">
          <InputLabel id="type-label">Type</InputLabel>
          <Select
            labelId="type-label"
            name="type"
            value={formData.type}
            onChange={handleChange}
            size="small"
            label="Type"
          >
            <MenuItem value="">Select Type</MenuItem>
            <MenuItem value="ISAE3702/SOC 1">ISAE3702/SOC 1</MenuItem>
            <MenuItem value="SOC 2">SOC 2</MenuItem>
          </Select>
        </FormControl>
        <TextField
          label="Nature"
          name="nature"
          value={formData.nature}
          onChange={handleChange}
          fullWidth
          margin="normal"
          size="small"
          variant="outlined"
          placeholder="e.g., Internal, External"
        />
        <AppReactDatepicker
          boxProps={{ sx: { width: '100%', mt: 2, mb: 2 } }}
          selected={formData.startDate}
          placeholderText="YYYY-MM-DD"
          dateFormat="yyyy-MM-dd"
          onChange={handleDateChange('startDate')}
          customInput={<TextField fullWidth size="small" label="Start Date" variant="outlined" />}
        />
        <AppReactDatepicker
          boxProps={{ sx: { width: '100%', mb: 2 } }}
          selected={formData.endDate}
          placeholderText="YYYY-MM-DD"
          dateFormat="yyyy-MM-dd"
          onChange={handleDateChange('endDate')}
          customInput={<TextField fullWidth size="small" label="End Date" variant="outlined" />}
        />
        <TextField
          label="Audit Subject"
          name="auditSubject"
          value={formData.auditSubject}
          onChange={handleChange}
          fullWidth
          margin="normal"
          size="small"
          variant="outlined"
          placeholder="e.g., Financial Audit"
        />
        <FormControl fullWidth margin="normal">
          <InputLabel id="status-label">Status</InputLabel>
          <Select
            labelId="status-label"
            name="status"
            value={formData.status}
            onChange={handleChange}
            size="small"
            label="Status"
          >
            <MenuItem value="">Select Status</MenuItem>
            <MenuItem value="Active">Active</MenuItem>
            <MenuItem value="Inactive">Inactive</MenuItem>
            <MenuItem value="Pending">Pending</MenuItem>
          </Select>
        </FormControl>
      </CardContent>
      <CardActions sx={{ justifyContent: 'flex-end', p: 2 }}>
        <Button variant="outlined" onClick={handleReset}>
          Reset
        </Button>
        <Button variant="contained" color="primary" onClick={handleSubmit}>
          Submit
        </Button>
      </CardActions>
    </Card>
  );
};

export default AddReportForm;
