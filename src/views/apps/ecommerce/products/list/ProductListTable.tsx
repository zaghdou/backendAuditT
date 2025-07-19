'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import axios from 'axios';
import {
  Card,
  CardHeader,
  CardContent,
  Button,
  Chip,
  Checkbox,
  Divider,
  TablePagination,
  Typography,
  Alert,
  CircularProgress,
  Box,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Avatar,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
} from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'react-toastify';
import { deepOrange, green } from '@mui/material/colors';

// Icons
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import SearchIcon from '@mui/icons-material/Search';
import BusinessIcon from '@mui/icons-material/Business';

// --- CONFIGURATION ---
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// --- TYPES ---
export type ProjectType = {
  id: number;
  mission_name: string;
  number_of_report: number;
  status: 'active' | 'inactive' | 'pending';
  sujet_audit?: string;
  client_id: number;
  client_name: string;
  fiscal_year: string;
  price?: number;
  library_name?: string;
};

type ProjectWithActionsType = ProjectType & {
  action?: string;
};

// --- CONSTANTES ET FONCTIONS UTILITAIRES ---
const statusMap: { [key: string]: { title: string; color: 'success' | 'error' | 'warning' } } = {
  active: { title: 'Active', color: 'success' },
  inactive: { title: 'Inactive', color: 'error' },
  pending: { title: 'Pending', color: 'warning' },
};

const columnHelper = createColumnHelper<ProjectWithActionsType>();

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
      sx={{
        '& .MuiOutlinedInput-root': {
          borderRadius: '8px',
        },
      }}
    />
  );
};

// --- COMPOSANT PRINCIPAL ---
const ProductListTable = () => {
  const [data, setData] = useState<ProjectType[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { lang: locale } = useParams();

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.get(`/api/missions`, {
        params: {
          page: page + 1,
          per_page: pageSize,
          search: globalFilter || undefined,
        },
      });

      const missions = response.data.missions || [];
      const totalMissions = response.data.total || 0;

      const mappedProjects: ProjectType[] = missions.map((mission: any) => ({
        id: mission.id,
        mission_name: mission.mission_name || 'N/A',
        number_of_report: mission.number_of_report || 0,
        status: mission.status?.toLowerCase() || 'pending',
        sujet_audit: mission.sujet_audit || 'N/A',
        client_id: mission.client_id,
        client_name: mission.client_name || 'N/A',
        fiscal_year: mission.fiscal_year?.toString() || 'N/A',
        price: mission.price || 0,
        library_name: mission.library_name || 'N/A',
      }));

      setData(mappedProjects);
      setTotal(totalMissions);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || `Failed to fetch missions: ${err.message}`;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, globalFilter]);

  const handleDelete = useCallback(async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this mission?')) return;
    setLoading(true);
    try {
      await axiosInstance.delete(`/api/missions/${id}`);
      fetchProjects();
      toast.success('Mission deleted successfully');
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || `Failed to delete mission: ${err.message}`;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [fetchProjects]);

  const columns = useMemo<ColumnDef<ProjectWithActionsType, any>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      },
      columnHelper.accessor('mission_name', {
        header: 'Mission',
        cell: ({ row }) => (
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Avatar sx={{ bgcolor: deepOrange[500], width: 32, height: 32, mr: 2, fontSize: '0.875rem' }}>
              {row.original.mission_name.charAt(0)}
            </Avatar>
            <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
              {row.original.mission_name}
            </Typography>
          </Box>
        ),
      }),
      columnHelper.accessor('client_name', {
        header: 'Client',
        cell: ({ row }) => (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <BusinessIcon sx={{ color: 'text.secondary', mr: 1.5, fontSize: '1.25rem' }} />
                <Typography variant="body2">{row.original.client_name}</Typography>
            </Box>
        ),
      }),
      columnHelper.accessor('fiscal_year', {
        header: 'Fiscal Year',
        cell: ({ row }) => <Typography variant="body2">{row.original.fiscal_year}</Typography>,
      }),
      columnHelper.accessor('number_of_report', {
        header: 'Reports',
        cell: ({ row }) => (
          <Link href={`/${locale}/apps/invoice/list?missionId=${row.original.id}`} passHref>
            <Chip label={row.original.number_of_report} color="primary" variant="outlined" size="small" sx={{cursor: 'pointer'}}/>
          </Link>
        ),
      }),
      columnHelper.accessor('price', {
        header: 'Price',
        cell: ({ row }) => (
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {row.original.price ? `${row.original.price.toFixed(2)} €` : 'N/A'}
          </Typography>
        ),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: ({ row }) => (
          <Chip
            label={statusMap[row.original.status]?.title || row.original.status}
            color={statusMap[row.original.status]?.color || 'default'}
            size="small"
            variant="tonal"
          />
        ),
      }),
      columnHelper.accessor('action', {
        header: 'Actions',
        cell: ({ row }) => (
          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
            <Tooltip title="Edit">
              <IconButton
                size="small"
                component={Link}
                href={`/${locale}/projects/edit/${row.original.id}`}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton
                size="small"
                color="error"
                onClick={() => handleDelete(row.original.id)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ),
        enableSorting: false,
      }),
    ],
    [handleDelete, locale]
  );

  const table = useReactTable({
    data,
    columns,
    state: { rowSelection, globalFilter, pagination: { pageIndex: page, pageSize } },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    manualFiltering: true,
    pageCount: Math.ceil(total / pageSize),
  });

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <Card sx={{ m: { xs: 2, md: 4 }, borderRadius: 2, boxShadow: 3 }}>
      <CardHeader
        title={<Typography variant="h5" sx={{ fontWeight: 600 }}>Missions List</Typography>}
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
            <DebouncedInput
              value={globalFilter ?? ''}
              onChange={(value) => setGlobalFilter(String(value))}
              placeholder="Search missions..."
            />
            <Button
              variant="contained"
              component={Link}
              href={`/${locale}/apps/ecommerce/products/add`}
              startIcon={<AddIcon />}
            >
              Add Mission
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
                    <Typography sx={{ mt: 2 }}>Loading missions...</Typography>
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
  );
};

export default ProductListTable;
