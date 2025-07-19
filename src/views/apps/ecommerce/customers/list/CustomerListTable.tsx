'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  MRT_ColumnDef,
  MRT_PaginationState,
  MaterialReactTable,
  useMaterialReactTable,
} from 'material-react-table';
import { Box, Button, Chip, TextField, Typography } from '@mui/material';
import AddCustomerDialog from './AddCustomerDialog';

// --- TYPES ---
// Ce type doit correspondre à la structure de données de votre client
export interface Customer {
  id: number;
  company_name: string;
  secteur_d_activite: string | null;
  status: 'active' | 'inactive';
  number_of_active_user: number;
  number_of_active_project: number;
  total_mission_price: number;
}

interface BackendResponse {
  clients: Customer[];
  total: number;
  page: number;
  per_page: number;
}

// --- CONFIGURATION ---
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

const CustomerListTable = () => {
  const [data, setData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagination, setPagination] = useState<MRT_PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const router = useRouter();

  const fetchCustomers = useCallback(
    async (retries = 3, delay = 1000) => {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/clients?page=${pagination.pageIndex + 1}&per_page=${
          pagination.pageSize
        }${globalFilter ? `&search=${encodeURIComponent(globalFilter)}` : ''}`;
        const response = await axiosInstance.get<BackendResponse>(url);

        const clients = (response.data.clients || []).map(client => ({
          ...client,
          status: client.status.toLowerCase() as 'active' | 'inactive',
        }));

        setData(clients);
        setTotal(response.data.total || 0);
      } catch (err: any) {
        if (err.code === 'ECONNREFUSED' && retries > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchCustomers(retries - 1, delay * 2);
        }
        const errorMessage = err.response?.data?.error || `Failed to fetch clients: ${err.message}`;
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [pagination.pageIndex, pagination.pageSize, globalFilter]
  );

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleAddCustomer = async (customerData: {
    company_name: string;
    secteur_d_activite: string | null;
    status: string;
  }) => {
    setLoading(true);
    try {
      await axiosInstance.post('/api/clients', customerData);
      toast.success('Customer added successfully');
      fetchCustomers();
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || `Failed to add customer: ${err.message}`;
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleEditCustomer = async (
    id: number,
    customerData: {
      company_name: string;
      secteur_d_activite: string | null;
      status: string;
    }
  ) => {
    setLoading(true);
    try {
      await axiosInstance.put(`/api/clients/${id}`, customerData);
      toast.success('Customer updated successfully');
      fetchCustomers();
    } catch (err: any) { // <-- L'ACCOLADE MANQUANTE EST AJOUTÉE ICI
      const errorMessage = err.response?.data?.error || `Failed to update customer: ${err.message}`;
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) return;
    setLoading(true);
    setError(null);
    try {
      await axiosInstance.delete(`/api/clients/${id}`);
      toast.success('Customer deleted successfully');
      fetchCustomers();
    } catch (err: any) {
      const errorMessage =
        err.response?.status === 404
          ? 'Customer not found'
          : err.response?.data?.error || `Failed to delete customer: ${err.message}`;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async (id: number) => {
    if (!window.confirm('Are you sure you want to deactivate this customer?')) return;
    setLoading(true);
    setError(null);
    try {
      await axiosInstance.put(`/api/clients/${id}`, { status: 'inactive' });
      toast.success('Customer deactivated successfully');
      fetchCustomers();
    } catch (err: any) {
      const errorMessage =
        err.response?.status === 404
          ? 'Customer not found'
          : err.response?.data?.error || `Failed to deactivate customer: ${err.message}`;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get('/api/clients/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'clients.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('Customers exported successfully');
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to export clients';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const columns = useMemo<MRT_ColumnDef<Customer>[]>(
    () => [
      { accessorKey: 'id', header: 'ID', enableEditing: false, size: 80 },
      { accessorKey: 'company_name', header: 'Company Name', muiEditTextFieldProps: { required: true } },
      {
        accessorKey: 'total_mission_price',
        header: 'Total Mission Price',
        enableEditing: false,
        Cell: ({ cell }) => (
          <Typography>
            €{(cell.getValue<number>() || 0).toFixed(2)}
          </Typography>
        ),
      },
      { accessorKey: 'secteur_d_activite', header: 'Activity Sector' },
      {
        accessorKey: 'status',
        header: 'Status',
        editVariant: 'select',
        editSelectOptions: ['active', 'inactive'],
        Cell: ({ cell }) => (
          <Chip
            label={cell.getValue<string>().toLowerCase()}
            color={cell.getValue<string>().toLowerCase() === 'active' ? 'success' : 'error'}
            variant='tonal'
            size='small'
          />
        ),
      },
      {
        accessorKey: 'action',
        header: 'Action',
        enableSorting: false,
        enableColumnActions: false,
        Cell: ({ row }) => (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant='outlined'
              size='small'
              onClick={() => {
                setSelectedCustomer(row.original);
                setOpenAddDialog(true);
              }}
            >
              Edit
            </Button>
            <Button
              variant='outlined'
              size='small'
              onClick={() => handleDeactivate(row.original.id)}
              disabled={row.original.status.toLowerCase() === 'inactive'}
            >
              Deactivate
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => router.push(`/en/apps/ecommerce/customers/details/${row.original.id}`)}
            >
              Details
            </Button>
            <Button
              variant='outlined'
              color='error'
              size='small'
              onClick={() => handleDelete(row.original.id)}
            >
              Delete
            </Button>
          </Box>
        ),
      },
    ],
    [router]
  );

  const table = useMaterialReactTable({
    columns,
    data,
    state: { isLoading: loading, showAlertBanner: !!error, pagination, globalFilter },
    rowCount: total,
    manualPagination: true,
    manualFiltering: true,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    renderTopToolbarCustomActions: () => (
      <Box sx={{ display: 'flex', gap: 1, p: '8px' }}>
        <TextField
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
          placeholder='Search...'
          variant='outlined'
          size='small'
        />
        <Button
          variant='contained'
          onClick={() => {
            setSelectedCustomer(null);
            setOpenAddDialog(true);
          }}
        >
          Add Customer
        </Button>
        <Button variant='contained' onClick={handleExport}>
          Export
        </Button>
      </Box>
    ),
  });

  return (
    <>
      <MaterialReactTable table={table} />
      <AddCustomerDialog
        open={openAddDialog}
        handleClose={() => {
          setOpenAddDialog(false);
          setSelectedCustomer(null);
        }}
        handleAddCustomer={handleAddCustomer}
        handleEditCustomer={handleEditCustomer}
        customer={selectedCustomer}
      />
    </>
  );
};

export default CustomerListTable;
