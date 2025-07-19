'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Typography,
} from '@mui/material';
import axios from 'axios';

interface AddCategoryDialogProps {
  open: boolean;
  onClose: () => void;
}

const AddCategoryDialog: React.FC<AddCategoryDialogProps> = ({ open, onClose }) => {
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const libraryTypes = [
    { value: '1', label: 'TYPE_1' },
    { value: '2', label: 'TYPE_2' },
  ];

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Category name is required.');
      return;
    }
    if (!type) {
      setError('Library type is required.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        type,
        number_of_section: 0,
      };
      console.log('Sending library payload:', payload);
      await axios.post('http://localhost:5000/api/libraries', payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      setError(null);
      setName('');
      setType('');
      onClose();
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error || err.message || 'Failed to create library. Please try again.';
      console.error('Error creating library:', err.message, err.response?.data || err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add New Category</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        <TextField
          label="Category Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          margin="normal"
          required
          inputProps={{ maxLength: 255 }}
          error={!!error && !name.trim()}
          helperText={!!error && !name.trim() ? 'Category name is required' : ''}
        />
        <FormControl fullWidth margin="normal" required error={!!error && !type}>
          <InputLabel>Library Type</InputLabel>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value)}
            label="Library Type"
          >
            <MenuItem value="">
              <em>Select Type</em>
            </MenuItem>
            {libraryTypes.map((typeOption) => (
              <MenuItem key={typeOption.value} value={typeOption.value}>
                {typeOption.label}
              </MenuItem>
            ))}
          </Select>
          {!!error && !type && (
            <Typography color="error" variant="caption">
              Library type is required
            </Typography>
          )}
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="secondary" disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          color="primary"
          variant="contained"
          disabled={loading || !name.trim() || !type}
        >
          {loading ? <CircularProgress size={24} /> : 'Add Category'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddCategoryDialog;
