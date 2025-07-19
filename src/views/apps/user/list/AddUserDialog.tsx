'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Alert, CircularProgress,
  Box, Typography, Select, FormControl, InputLabel
} from '@mui/material';
import axios from 'axios';
import { toast } from 'react-toastify';

type Props = {
  open: boolean;
  handleClose: () => void;
  // MODIFICATION: Renommé pour plus de clarté
  handleSaveUser: (user: Partial<{
    id?: number;
    fullname: string;
    username: string;
    email: string;
    phone_number: string;
    role: string;
    password?: string; // Mot de passe est optionnel
  }>) => Promise<void>;
  userToEdit?: {
    id: number;
    fullname: string;
    username: string;
    email: string;
    phone_number: string | null;
    role: string;
  } | null;
};

const AddUserDialog = ({ open, handleClose, handleSaveUser, userToEdit }: Props) => {
  const [formData, setFormData] = useState({
    fullname: '',
    username: '',
    email: '',
    phone_number: '',
    role: '',
    password: '',
  });
  const [roles, setRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{
    fullname?: string;
    username?: string;
    email?: string;
    phone_number?: string;
    role?: string;
    password?: string;
  }>({});

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/roles');
        setRoles(response.data.roles || []);
        // Définir un rôle par défaut si la liste est chargée et qu'aucun rôle n'est défini
        if (response.data.roles?.length > 0 && !userToEdit) {
            setFormData(prev => ({ ...prev, role: response.data.roles[0] }));
        }
      } catch (err) {
        toast.error('Failed to load roles');
      }
    };
    fetchRoles();
  }, [userToEdit]); // Re-fetch n'est pas nécessaire à chaque ouverture

  useEffect(() => {
    if (open) {
        if (userToEdit) {
          setFormData({
            fullname: userToEdit.fullname,
            username: userToEdit.username,
            email: userToEdit.email,
            phone_number: userToEdit.phone_number || '',
            role: userToEdit.role,
            password: '', // Toujours vide pour la modification
          });
        } else {
          // Reset pour un nouvel utilisateur
          setFormData({
            fullname: '',
            username: '',
            email: '',
            phone_number: '',
            role: roles.length > 0 ? roles[0] : '', // Utiliser le premier rôle par défaut
            password: '',
          });
        }
        setError(null);
        setValidationErrors({});
    }
  }, [open, userToEdit, roles]);

  const validateForm = () => {
    const errors: typeof validationErrors = {};
    if (!formData.fullname.trim()) errors.fullname = 'Full name is required';
    if (!formData.username.trim()) errors.username = 'Username is required';
    if (!formData.email.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Invalid email format';
    if (!formData.role) errors.role = 'Role is required';

    // La validation du mot de passe ne s'applique que pour les nouveaux utilisateurs
    // ou si l'utilisateur a commencé à taper un nouveau mot de passe lors de la modification
    if (!userToEdit && !formData.password) {
        errors.password = 'Password is required for new users';
    } else if (formData.password && formData.password.length < 5) {
        errors.password = 'Password must be at least 5 characters long';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
    const { name, value } = e.target;
    if (name) {
      setFormData({ ...formData, [name]: value as string });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error('Please correct the validation errors.');
      return;
    }

    setLoading(true);
    try {
      // ==================== CORRECTION CLÉ ICI ====================
      // On construit un payload propre pour ne pas envoyer de champs vides inutiles
      const payload: any = {
        fullname: formData.fullname.trim(),
        username: formData.username.trim(),
        email: formData.email.trim(),
        phone_number: formData.phone_number.trim() || null, // Envoyer null si vide
        role: formData.role,
      };

      // On ajoute l'ID si on est en mode édition
      if (userToEdit) {
        payload.id = userToEdit.id;
      }

      // On ajoute le mot de passe SEULEMENT s'il a été rempli
      if (formData.password) {
        payload.password = formData.password;
      }
      // ==========================================================

      await handleSaveUser(payload);
      toast.success(userToEdit ? 'User updated successfully' : 'User added successfully');
      handleClose();
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Operation failed';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{userToEdit ? 'Edit User' : 'Add New User'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <TextField
            fullWidth
            label="Full Name"
            name="fullname"
            value={formData.fullname}
            onChange={handleChange}
            required
            error={!!validationErrors.fullname}
            helperText={validationErrors.fullname}
          />
          <TextField
            fullWidth
            label="Username"
            name="username"
            value={formData.username}
            onChange={handleChange}
            required
            error={!!validationErrors.username}
            helperText={validationErrors.username}
          />
          <TextField
            fullWidth
            label="Email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            required
            error={!!validationErrors.email}
            helperText={validationErrors.email}
          />
          <TextField
            fullWidth
            label="Phone Number (Optional)"
            name="phone_number"
            value={formData.phone_number}
            onChange={handleChange}
            error={!!validationErrors.phone_number}
            helperText={validationErrors.phone_number}
          />
          <FormControl fullWidth required error={!!validationErrors.role}>
            <InputLabel id="role-label">Role</InputLabel>
            <Select
              labelId="role-label"
              name="role"
              value={formData.role}
              onChange={handleChange}
              label="Role"
            >
              {roles.map((role) => (
                <MenuItem key={role} value={role}>
                  {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </MenuItem>
              ))}
            </Select>
            {validationErrors.role && <Typography color="error" variant="caption">{validationErrors.role}</Typography>}
          </FormControl>
          <TextField
            fullWidth
            label={userToEdit ? "New Password (leave blank to keep current)" : "Password"}
            name="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            required={!userToEdit}
            error={!!validationErrors.password}
            helperText={validationErrors.password}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? <CircularProgress size={24} /> : (userToEdit ? 'Update' : 'Add')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddUserDialog;
