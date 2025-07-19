'use client';

import { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import { toast } from 'react-toastify';

// MODIFICATION: L'interface n'a plus 'price', mais 'total_mission_price' pour la lecture
interface Customer {
  id: number;
  company_name: string;
  total_mission_price: number; // Modifié de 'price' à 'total_mission_price'
  secteur_d_activite: string | null;
  status: string;
}

// MODIFICATION: Les signatures des fonctions de gestion n'incluent plus 'price'
interface Props {
  open: boolean;
  handleClose: () => void;
  handleAddCustomer: (customerData: {
    company_name: string;
    secteur_d_activite: string | null;
    status: string;
  }) => Promise<void>;
  handleEditCustomer: (
    id: number,
    customerData: {
      company_name: string;
      secteur_d_activite: string | null;
      status: string;
    }
  ) => Promise<void>;
  customer: Customer | null;
}

const AddCustomerDialog = ({ open, handleClose, handleAddCustomer, handleEditCustomer, customer }: Props) => {
  const [companyName, setCompanyName] = useState('');
  // MODIFICATION: L'état pour le prix est supprimé
  // const [price, setPrice] = useState<string>('0');
  const [secteurDActivite, setSecteurDActivite] = useState<string | null>('');
  const [status, setStatus] = useState('active');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{
    companyName?: string;
    secteurDActivite?: string;
    status?: string;
  }>({});

  useEffect(() => {
    if (customer) {
      setCompanyName(customer.company_name);
      setSecteurDActivite(customer.secteur_d_activite || '');
      setStatus(customer.status.toLowerCase());
      // MODIFICATION: Plus de prix à définir
    } else {
      setCompanyName('');
      setSecteurDActivite('');
      setStatus('active');
    }
    setError(null);
    setValidationErrors({});
  }, [customer, open]);

  const validateForm = () => {
    const errors: typeof validationErrors = {};
    if (!companyName.trim()) {
      errors.companyName = 'Company name is required';
    } else if (companyName.length > 255) {
      errors.companyName = 'Company name must be 255 characters or less';
    }
    // MODIFICATION: Validation du prix supprimée
    if (secteurDActivite && secteurDActivite.length > 100) {
      errors.secteurDActivite = 'Activity sector must be 100 characters or less';
    }
    if (!['active', 'inactive'].includes(status)) {
      errors.status = 'Status must be either Active or Inactive';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error('Please fix the validation errors');
      return;
    }

    setLoading(true);
    setError(null);

    // MODIFICATION: l'objet de données n'inclut plus de prix
    const customerData = {
      company_name: companyName.trim(),
      secteur_d_activite: secteurDActivite ? secteurDActivite.trim() : null,
      status: status.toLowerCase(),
    };

    try {
      if (customer) {
        await handleEditCustomer(customer.id, customerData);
      } else {
        await handleAddCustomer(customerData);
      }
      handleClose();
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || `Failed to save client: ${err.message}`;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth aria-labelledby="customer-dialog-title">
      <DialogTitle id="customer-dialog-title">{customer ? 'Edit Client' : 'Add Client'}</DialogTitle>
      <DialogContent sx={{ p: 4 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Company Name"
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            disabled={loading}
            placeholder="Enter company name"
            sx={{ mb: 2 }}
            autoFocus
            required
            error={!!validationErrors.companyName}
            helperText={validationErrors.companyName}
            inputProps={{ maxLength: 255 }}
          />
          {/* MODIFICATION: Le champ de texte pour le prix a été supprimé */}
          <TextField
            fullWidth
            label="Activity Sector"
            value={secteurDActivite || ''}
            onChange={e => setSecteurDActivite(e.target.value)}
            disabled={loading}
            placeholder="Enter activity sector"
            sx={{ mb: 2 }}
            error={!!validationErrors.secteurDActivite}
            helperText={validationErrors.secteurDActivite}
            inputProps={{ maxLength: 100 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }} disabled={loading} error={!!validationErrors.status}>
            <InputLabel id="status-label">Status</InputLabel>
            <Select
              labelId="status-label"
              value={status}
              label="Status"
              onChange={e => setStatus(e.target.value)}
              required
            >
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </Select>
            {validationErrors.status && (
              <Typography color="error" variant="caption">
                {validationErrors.status}
              </Typography>
            )}
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>Cancel</Button>
        <Button
          type="submit"
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {customer ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddCustomerDialog;
