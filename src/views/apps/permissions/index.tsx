'use client';

// React Imports
import { useEffect, useState, useMemo, useCallback } from 'react';

// MUI Imports
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import TablePagination from '@mui/material/TablePagination';
import IconButton from '@mui/material/IconButton';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import MenuItem from '@mui/material/MenuItem';
import type { TextFieldProps } from '@mui/material/TextField';

// Third-party Imports
import classnames from 'classnames';
import { rankItem } from '@tanstack/match-sorter-utils';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFacetedMinMaxValues,
} from '@tanstack/react-table';
import type { ColumnDef, FilterFn } from '@tanstack/react-table';
import type { RankingInfo } from '@tanstack/match-sorter-utils';
import axios from 'axios';
import { toast } from 'react-toastify';

// Style Imports
import tableStyles from '@core/styles/table.module.css';

// Type Imports
import type { ThemeColor } from '@core/types';
import type { TeamMemberType } from '@/types/apps/teamMemberTypes';

declare module '@tanstack/table-core' {
  interface FilterFns {
    fuzzy: FilterFn<unknown>;
  }
  interface FilterMeta {
    itemRank: RankingInfo;
  }
}

type TeamMemberTypeWithAction = TeamMemberType & {
  action?: string;
};

type Colors = {
  [key: string]: ThemeColor;
};

interface BackendResponse {
  team_members: TeamMemberType[];
  total: number;
  page: number;
  per_page: number;
}

const fuzzyFilter: FilterFn<any> = (row, columnId, value, addMeta) => {
  const itemRank = rankItem(row.getValue(columnId), value);
  addMeta({ itemRank });
  return itemRank.passed;
};

const DebouncedInput = ({
  value: initialValue,
  onChange,
  debounce = 500,
  ...props
}: {
  value: string | number;
  onChange: (value: string | number) => void;
  debounce?: number;
} & Omit<TextFieldProps, 'onChange'>) => {
  const [value, setValue] = useState(initialValue);
  useEffect(() => setValue(initialValue), [initialValue]);
  useEffect(() => {
    const timeout = setTimeout(() => onChange(value), debounce);
    return () => clearTimeout(timeout);
  }, [value, onChange, debounce]);
  return <TextField {...props} value={value} onChange={e => setValue(e.target.value)} size='small' />;
};

const colors: Colors = {
  filowner: 'info',
  engagement_leader: 'success',
  team_manager: 'warning',
  team_member: 'primary',
  reviewer: 'secondary',
  read_only: 'error',
};

const ROLES = [
  'filowner',
  'engagement_leader',
  'team_manager',
  'team_member',
  'reviewer',
  'read_only',
];

const columnHelper = createColumnHelper<TeamMemberTypeWithAction>();

const TeamMemberPermissions = () => {
  // States
  const [data, setData] = useState<TeamMemberType[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [globalFilter, setGlobalFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ id: 0, user_id: '', mission_id: '', role: 'read_only' });
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{
    user_id?: string;
    mission_id?: string;
    role?: string;
  }>({});

  const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  // Axios Instance
  const axiosInstance = axios.create({
    baseURL: BASE_URL,
    timeout: 10000,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  });

  // Add JWT token to requests
  axiosInstance.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Handle 401 errors
  axiosInstance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
  );

  // Fetch Team Members
  const fetchTeamMembers = useCallback(async (retries = 3, delay = 1000) => {
    setLoading(true);
    setError(null);
    try {
      console.log(`Fetching team members from: ${BASE_URL}/api/team-members?page=${page + 1}&per_page=${pageSize}`);
      const response = await axiosInstance.get<BackendResponse>(`/api/team-members?page=${page + 1}&per_page=${pageSize}`);
      if (!response.data.team_members) {
        throw new Error('Invalid response structure: team_members array is missing');
      }
      setData(response.data.team_members);
      setTotal(response.data.total || 0);
      console.log('Fetched team members:', response.data.team_members);
    } catch (err: any) {
      console.error('Fetch error:', err);
      if (retries > 0 && err.code === 'ECONNREFUSED') {
        console.log(`Retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchTeamMembers(retries - 1, delay * 2);
      }
      const errorMessage =
        err.response?.status === 404
          ? 'Aucun membre d’équipe trouvé'
          : err.response?.data?.error || `Échec de la récupération des membres d’équipe : ${err.message}`;
      setError(errorMessage);
      toast.error(errorMessage);
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, BASE_URL]);

  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);

  // Delete Team Member
  const handleDelete = async (id: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce membre d’équipe ?')) return;
    setLoading(true);
    setError(null);
    try {
      console.log(`Deleting team member at: ${BASE_URL}/api/team-members/${id}`);
      await axiosInstance.delete(`/api/team-members/${id}`);
      toast.success('Membre d’équipe supprimé avec succès');
      fetchTeamMembers();
    } catch (err: any) {
      const errorMessage =
        err.response?.status === 404
          ? 'Membre d’équipe non trouvé'
          : err.response?.data?.error || `Échec de la suppression du membre d’équipe : ${err.message}`;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Add Team Member
  const validateForm = () => {
    const errors: typeof validationErrors = {};
    if (!formData.user_id) errors.user_id = 'L’ID utilisateur est requis';
    else if (isNaN(Number(formData.user_id))) errors.user_id = 'L’ID utilisateur doit être un nombre';
    if (!formData.mission_id) errors.mission_id = 'L’ID mission est requis';
    else if (isNaN(Number(formData.mission_id))) errors.mission_id = 'L’ID mission doit être un nombre';
    if (!formData.role || !ROLES.includes(formData.role)) errors.role = 'Rôle invalide sélectionné';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddTeamMember = async () => {
    if (!validateForm()) {
      setFormError('Veuillez corriger les erreurs de validation');
      toast.error('Veuillez corriger les erreurs de validation');
      return;
    }

    setFormLoading(true);
    setFormError(null);

    try {
      console.log(`Creating team member at: ${BASE_URL}/api/team-members`, formData);
      await axiosInstance.post('/api/team-members', {
        user_id: Number(formData.user_id),
        mission_id: Number(formData.mission_id),
        role: formData.role,
      });
      toast.success('Membre d’équipe ajouté avec succès');
      fetchTeamMembers();
      handleCloseAddDialog();
    } catch (err: any) {
      const errorMessage =
        err.response?.status === 400
          ? err.response?.data?.error || 'Données de membre d’équipe invalides'
          : err.response?.data?.error || `Échec de l’ajout du membre d’équipe : ${err.message}`;
      setFormError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setFormLoading(false);
    }
  };

  // Edit Team Member Role
  const handleEditTeamMember = async () => {
    if (!formData.id) {
      setFormError('Aucun membre d’équipe sélectionné');
      toast.error('Aucun membre d’équipe sélectionné');
      return;
    }
    if (!ROLES.includes(formData.role)) {
      setFormError('Rôle invalide sélectionné');
      toast.error('Rôle invalide sélectionné');
      return;
    }

    setFormLoading(true);
    setFormError(null);

    try {
      console.log(`Updating team member at: ${BASE_URL}/api/team-members/${formData.id}`, { role: formData.role });
      await axiosInstance.put(`/api/team-members/${formData.id}`, { role: formData.role });
      toast.success('Rôle du membre d’équipe mis à jour avec succès');
      fetchTeamMembers();
      handleCloseEditDialog();
    } catch (err: any) {
      const errorMessage =
        err.response?.status === 404
          ? 'Membre d’équipe non trouvé'
          : err.response?.data?.error || `Échec de la mise à jour du rôle : ${err.message}`;
      setFormError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setFormLoading(false);
    }
  };

  const handleOpenEditDialog = (teamMember: TeamMemberType) => {
    setFormData({
      id: teamMember.id,
      user_id: teamMember.user_id.toString(),
      mission_id: teamMember.mission_id.toString(),
      role: teamMember.role,
    });
    setEditDialogOpen(true);
  };

  const handleCloseAddDialog = () => {
    setFormData({ id: 0, user_id: '', mission_id: '', role: 'read_only' });
    setFormError(null);
    setValidationErrors({});
    setFormLoading(false);
    setAddDialogOpen(false);
  };

  const handleCloseEditDialog = () => {
    setFormData({ id: 0, user_id: '', mission_id: '', role: 'read_only' });
    setFormError(null);
    setValidationErrors({});
    setFormLoading(false);
    setEditDialogOpen(false);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
    const { name, value } = e.target;
    if (name) {
      setFormData({ ...formData, [name]: value as string });
      setFormError(null);
      setValidationErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  // Table Columns
  const columns = useMemo<ColumnDef<TeamMemberTypeWithAction, any>[]>(
    () => [
      columnHelper.accessor('user_name', {
        header: 'Nom d’utilisateur',
        cell: ({ row }) => <Typography color='text.primary'>{row.original.user_name}</Typography>,
      }),
      columnHelper.accessor('role', {
        header: 'Rôle',
        cell: ({ row }) => (
          <Chip
            variant='tonal'
            label={row.original.role.replace('_', ' ').toUpperCase()}
            color={colors[row.original.role]}
            size='small'
          />
        ),
      }),
      columnHelper.accessor('mission_id', {
        header: 'ID Mission',
        cell: ({ row }) => <Typography>{row.original.mission_id}</Typography>,
      }),
      columnHelper.accessor('user_id', {
        header: 'ID Utilisateur',
        cell: ({ row }) => <Typography>{row.original.user_id}</Typography>,
      }),
      columnHelper.accessor('action', {
        header: 'Actions',
        cell: ({ row }) => {
          const user = JSON.parse(localStorage.getItem('user') || '{}');
          const canModify = ['admin_superior', 'manager'].includes(user?.role);
          return canModify ? (
            <div className='flex items-center gap-0.5'>
              <IconButton
                size='small'
                onClick={() => handleOpenEditDialog(row.original)}
                aria-label={`Modifier le rôle de ${row.original.user_name}`}
              >
                <i className='ri-edit-box-line text-textSecondary' />
              </IconButton>
              <IconButton
                size='small'
                onClick={() => handleDelete(row.original.id)}
                aria-label={`Supprimer le membre d’équipe ${row.original.user_name}`}
              >
                <i className='ri-delete-bin-7-line text-textSecondary' />
              </IconButton>
            </div>
          ) : null;
        },
        enableSorting: false,
      }),
    ],
    []
  );

  // Table Setup
  const table = useReactTable({
    data,
    columns,
    filterFns: { fuzzy: fuzzyFilter },
    state: { globalFilter, pagination: { pageIndex: page, pageSize } },
    globalFilterFn: fuzzyFilter,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    manualPagination: true,
    pageCount: Math.ceil(total / pageSize),
  });

  return (
    <>
      <Card>
        <CardContent className='flex flex-col sm:flex-row items-start sm:items-center justify-between max-sm:gap-4'>
          <DebouncedInput
            value={globalFilter ?? ''}
            onChange={value => setGlobalFilter(String(value))}
            placeholder='Rechercher des membres d’équipe'
            className='max-sm:is-full'
          />
          <Button
            variant='contained'
            onClick={() => setAddDialogOpen(true)}
            className='max-sm:is-full'
            startIcon={<i className='ri-add-line' />}
            aria-label='Ajouter un nouveau membre d’équipe'
          >
            Ajouter un membre d’équipe
          </Button>
        </CardContent>
        <div className='overflow-x-auto'>
          {loading ? (
            <CircularProgress sx={{ display: 'block', mx: 'auto', my: 4 }} />
          ) : error ? (
            <Alert
              severity='error'
              sx={{ m: 4 }}
              action={
                <Button color='inherit' size='small' onClick={fetchTeamMembers}>
                  Réessayer
                </Button>
              }
            >
              {error}
            </Alert>
          ) : data.length === 0 ? (
            <Alert severity='info' sx={{ m: 4 }}>
              {globalFilter ? 'Aucun résultat trouvé' : 'Aucun membre d’équipe disponible'}
            </Alert>
          ) : (
            <table className={tableStyles.table}>
              <thead>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <th key={header.id}>
                        {header.isPlaceholder ? null : (
                          <div
                            className={classnames({
                              'flex items-center': header.column.getIsSorted(),
                              'cursor-pointer select-none': header.column.getCanSort(),
                            })}
                            onClick={header.column.getToggleSortingHandler()}
                            role='button'
                            aria-sort={
                              header.column.getIsSorted()
                                ? header.column.getIsSorted() === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{
                              asc: <i className='ri-arrow-up-s-line text-xl' />,
                              desc: <i className='ri-arrow-down-s-line text-xl' />,
                            }[header.column.getIsSorted() as 'asc' | 'desc'] ?? null}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={table.getVisibleFlatColumns().length} className='text-center'>
                      Aucun membre d’équipe disponible
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map(row => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
        <TablePagination
          rowsPerPageOptions={[5, 7, 10]}
          component='div'
          className='border-bs'
          count={total}
          rowsPerPage={pageSize}
          page={page}
          SelectProps={{
            inputProps: { 'aria-label': 'lignes par page' },
          }}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={e => {
            setPageSize(Number(e.target.value));
            setPage(0);
          }}
          labelRowsPerPage='Lignes par page'
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      </Card>

      {/* Add Team Member Dialog */}
      <Dialog open={addDialogOpen} onClose={handleCloseAddDialog} maxWidth='sm' fullWidth>
        <DialogTitle>Ajouter un membre d’équipe</DialogTitle>
        <DialogContent>
          {formError && <Alert severity='error' sx={{ mb: 4 }}>{formError}</Alert>}
          <TextField
            fullWidth
            label='ID Utilisateur'
            name='user_id'
            type='number'
            value={formData.user_id}
            onChange={handleFormChange}
            sx={{ mb: 4 }}
            required
            error={!!validationErrors.user_id}
            helperText={validationErrors.user_id}
            disabled={formLoading}
            aria-required='true'
            aria-label='ID Utilisateur'
          />
          <TextField
            fullWidth
            label='ID Mission'
            name='mission_id'
            type='number'
            value={formData.mission_id}
            onChange={handleFormChange}
            sx={{ mb: 4 }}
            required
            error={!!validationErrors.mission_id}
            helperText={validationErrors.mission_id}
            disabled={formLoading}
            aria-required='true'
            aria-label='ID Mission'
          />
          <TextField
            fullWidth
            select
            label='Rôle'
            name='role'
            value={formData.role}
            onChange={handleFormChange}
            sx={{ mb: 4 }}
            required
            error={!!validationErrors.role}
            helperText={validationErrors.role}
            disabled={formLoading}
            aria-required='true'
            aria-label='Rôle'
          >
            {ROLES.map(role => (
              <MenuItem key={role} value={role}>
                {role.replace('_', ' ').toUpperCase()}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button variant='outlined' onClick={handleCloseAddDialog} disabled={formLoading} aria-label='Annuler'>
            Annuler
          </Button>
          <Button
            variant='contained'
            onClick={handleAddTeamMember}
            disabled={formLoading || Object.keys(validationErrors).length > 0}
            startIcon={formLoading ? <CircularProgress size={24} /> : null}
            aria-label='Ajouter un membre d’équipe'
          >
            Ajouter
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Team Member Role Dialog */}
      <Dialog open={editDialogOpen} onClose={handleCloseEditDialog} maxWidth='sm' fullWidth>
        <DialogTitle>Modifier le rôle du membre d’équipe</DialogTitle>
        <DialogContent>
          {formError && <Alert severity='error' sx={{ mb: 4 }}>{formError}</Alert>}
          <TextField
            fullWidth
            label='ID Utilisateur'
            name='user_id'
            type='number'
            value={formData.user_id}
            disabled
            sx={{ mb: 4 }}
            aria-label='ID Utilisateur'
          />
          <TextField
            fullWidth
            label='ID Mission'
            name='mission_id'
            type='number'
            value={formData.mission_id}
            disabled
            sx={{ mb: 4 }}
            aria-label='ID Mission'
          />
          <TextField
            fullWidth
            select
            label='Rôle'
            name='role'
            value={formData.role}
            onChange={handleFormChange}
            sx={{ mb: 4 }}
            required
            error={!!validationErrors.role}
            helperText={validationErrors.role}
            disabled={formLoading}
            aria-required='true'
            aria-label='Rôle'
          >
            {ROLES.map(role => (
              <MenuItem key={role} value={role}>
                {role.replace('_', ' ').toUpperCase()}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button variant='outlined' onClick={handleCloseEditDialog} disabled={formLoading} aria-label='Annuler'>
            Annuler
          </Button>
          <Button
            variant='contained'
            onClick={handleEditTeamMember}
            disabled={formLoading || !!validationErrors.role}
            startIcon={formLoading ? <CircularProgress size={24} /> : null}
            aria-label='Mettre à jour le rôle'
          >
            Mettre à jour
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default TeamMemberPermissions;
