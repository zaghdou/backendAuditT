'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card, CardHeader, CardContent, Divider, Button, TextField, Typography, Alert, CircularProgress,
  TablePagination, IconButton, Box, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Avatar, Tooltip, Chip
} from '@mui/material';
import { deepPurple } from '@mui/material/colors';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  createColumnHelper, getCoreRowModel, useReactTable,
  getPaginationRowModel, getSortedRowModel, flexRender
} from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import AddUserDialog from './AddUserDialog';

// Icons
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import SearchIcon from '@mui/icons-material/Search';

// --- TYPES ---
type UserType = {
  id: number;
  fullname: string;
  username: string;
  email: string;
  phone_number: string | null;
  role: string;
};

// --- CONFIGURATION ---
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const axiosInstance = axios.create({ baseURL: API_BASE_URL });

const columnHelper = createColumnHelper<UserType>();

// --- COMPOSANTS INTERNES ---
const DebouncedInput = ({
  value: initialValue,
  onChange,
  debounce = 500,
  ...props
}: {
  value: string | number;
  onChange: (value: string | number) => void;
  debounce?: number;
} & Omit<React.ComponentProps<typeof TextField>, 'onChange'>) => {
  const [value, setValue] = useState(initialValue);
  useEffect(() => setValue(initialValue), [initialValue]);
  useEffect(() => {
    const timeout = setTimeout(() => onChange(value), debounce);
    return () => clearTimeout(timeout);
  }, [value, onChange, debounce]);

  return (
    <TextField
      {...props}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      size="small"
      variant="outlined"
      InputProps={{
        startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
      }}
      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
    />
  );
};

// --- COMPOSANT PRINCIPAL ---
const UserListTable = () => {
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<UserType | null>(null);
  const [data, setData] = useState<UserType[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [globalFilter, setGlobalFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.get('/api/users', {
        params: { page: page + 1, per_page: pageSize, search: globalFilter || undefined },
      });
      setData(response.data.users || []);
      setTotal(response.data.total || 0);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to fetch users';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, globalFilter]);

  const handleSaveUser = useCallback(async (userData: any) => {
    setLoading(true);
    try {
      if (userToEdit) {
        await axiosInstance.put(`/api/users/${userToEdit.id}`, userData);
        toast.success('User updated successfully');
      } else {
        await axiosInstance.post('/api/users', userData);
        toast.success('User added successfully');
      }
      fetchUsers();
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || `Failed to save user`;
      toast.error(errorMessage);
      throw err; // Re-throw to handle in dialog
    } finally {
      setLoading(false);
    }
  }, [userToEdit, fetchUsers]);

  const handleDeleteUser = useCallback(async (userId: number) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    setLoading(true);
    try {
      await axiosInstance.delete(`/api/users/${userId}`);
      toast.success('User deleted successfully');
      fetchUsers();
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to delete user';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [fetchUsers]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const columns = useMemo<ColumnDef<UserType, any>[]>(
    () => [
      columnHelper.accessor('fullname', {
        header: 'User',
        cell: ({ row }) => (
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Avatar sx={{ bgcolor: deepPurple[500], width: 32, height: 32, mr: 2 }}>
              {row.original.fullname.charAt(0)}
            </Avatar>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                {row.original.fullname}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {row.original.username}
              </Typography>
            </Box>
          </Box>
        ),
      }),
      columnHelper.accessor('email', {
        header: 'Email',
        cell: ({ row }) => <Typography variant="body2">{row.original.email}</Typography>,
      }),
      columnHelper.accessor('phone_number', {
        header: 'Phone',
        cell: ({ row }) => <Typography variant="body2">{row.original.phone_number || 'N/A'}</Typography>,
      }),
      columnHelper.accessor('role', {
        header: 'Role',
        cell: ({ row }) => (
          <Chip
            label={row.original.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            color="primary"
            variant="tonal"
            size="small"
          />
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
            <Tooltip title="Edit">
              <IconButton
                size="small"
                onClick={() => {
                  setUserToEdit(row.original);
                  setAddUserOpen(true);
                }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton
                size="small"
                color="error"
                onClick={() => handleDeleteUser(row.original.id)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ),
      }),
    ],
    [handleDeleteUser]
  );

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter, pagination: { pageIndex: page, pageSize } },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    manualFiltering: true,
    pageCount: Math.ceil(total / pageSize),
  });

  return (
    <>
      <Card sx={{ m: { xs: 2, md: 4 }, borderRadius: 2, boxShadow: 3 }}>
        <CardHeader
          title={<Typography variant="h5" sx={{ fontWeight: 600 }}>Users List</Typography>}
          action={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
              <DebouncedInput
                value={globalFilter ?? ''}
                onChange={(value) => setGlobalFilter(String(value))}
                placeholder="Search users..."
              />
              <Button
                variant="contained"
                onClick={() => {
                  setUserToEdit(null);
                  setAddUserOpen(true);
                }}
                startIcon={<AddIcon />}
              >
                Add User
              </Button>
            </Box>
          }
          sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
        />
        <CardContent sx={{ p: 0 }}>
          {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}
          <TableContainer component={Paper} elevation={0}>
            <Table>
              <TableHead sx={{ bgcolor: 'grey.100' }}>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableCell key={header.id} sx={{ fontWeight: 'bold', color: 'text.primary' }}>
                        {header.isPlaceholder ? null : (
                          <Box
                            sx={{ display: 'flex', alignItems: 'center', cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{
                              asc: <ArrowUpwardIcon sx={{ ml: 1, fontSize: '1rem' }} />,
                              desc: <ArrowDownwardIcon sx={{ ml: 1, fontSize: '1rem' }} />,
                            }[header.column.getIsSorted() as string] ?? null}
                          </Box>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} align="center" sx={{ py: 10 }}>
                      <CircularProgress />
                      <Typography sx={{ mt: 2 }}>Loading users...</Typography>
                    </TableCell>
                  </TableRow>
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} align="center" sx={{ py: 10 }}>
                      <Typography color="text.secondary">No users found.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
        <Divider />
        <TablePagination
          component="div"
          count={total}
          rowsPerPage={pageSize}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[5, 10, 25, 50]}
        />
      </Card>
      <AddUserDialog
        open={addUserOpen}
        handleClose={() => {
          setAddUserOpen(false);
          setUserToEdit(null);
        }}
        handleSaveUser={handleSaveUser}
        userToEdit={userToEdit}
      />
    </>
  );
};

export default UserListTable;
