'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Card,
  CardHeader,
  CardContent,
  Divider,
  TablePagination,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
} from '@mui/material';
import { toast } from 'react-toastify';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
} from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';

// ================== LA CORRECTION EST ICI ==================
import axios from 'axios';
// =========================================================

// Icons
import { Visibility, Download, Search as SearchIcon } from '@mui/icons-material';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

// --- CONFIGURATION ---
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// --- TYPES ---
type ReportType = {
  id: number;
  nature: string;
  start_date: string;
  end_date: string;
  audit_subject: string;
  mission_id: number;
  mission_name?: string;
  library_id: number | null;
  library?: {
    id: number;
    name: string;
    number_of_section: number;
  };
  status: 'encours' | 'terminer';
  download_url?: string;
};

const columnHelper = createColumnHelper<ReportType>();

const statusMap: { [key: string]: { title: string; color: 'success' | 'warning' } } = {
  encours: { title: 'In Progress', color: 'warning' },
  terminer: { title: 'Terminated', color: 'success' },
};

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
const InvoiceListTable = () => {
  const [data, setData] = useState<ReportType[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [globalFilter, setGlobalFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const missionId = searchParams ? searchParams.get('missionId') : null;

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: (page + 1).toString(),
        per_page: pageSize.toString(),
      });
      if (missionId) {
        params.append('mission_id', missionId);
      }
      if (globalFilter) {
        params.append('search', globalFilter);
      }

      const response = await axiosInstance.get(`/api/reports`, { params });
      const reports = response.data.reports || [];

      setData(reports);
      setTotal(response.data.total || 0);
    } catch (err: any) {
      const errorMessage = err.response?.status === 404 ? 'No reports found' : err.response?.data?.error || 'Failed to fetch reports';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [missionId, page, pageSize, globalFilter]);

  const handleExport = async (reportId: number, fileName: string) => {
    setLoading(true);
    try {
      const response = await axiosInstance.get(`/api/reports/${reportId}/export`, {
        responseType: 'blob',
      });
      const fileUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = fileUrl;
      link.setAttribute('download', `${fileName}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(fileUrl);
      toast.success(`Report ${fileName}.pdf exported successfully`);
    } catch (err: any) {
      const errorMessage =
        err.response?.status === 403
          ? 'Report is not terminated, cannot export'
          : err.response?.data?.error || 'Failed to export report';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const columns = useMemo<ColumnDef<ReportType, any>[]>(
    () => {
      const baseColumns: ColumnDef<ReportType, any>[] = [
        columnHelper.accessor('id', {
          header: '#ID',
          cell: ({ row }) => <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>#{row.original.id}</Typography>,
        }),
        columnHelper.accessor('audit_subject', {
          header: 'Audit Subject',
          cell: ({ row }) => (
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>{row.original.audit_subject}</Typography>
              <Typography variant="caption" color="text.secondary">{row.original.nature || 'N/A'}</Typography>
            </Box>
          ),
        }),
        columnHelper.accessor('start_date', {
          header: 'Period',
          cell: ({ row }) => (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <CalendarTodayIcon sx={{ color: 'text.secondary', mr: 1.5, fontSize: '1.1rem' }} />
              <Box>
                <Typography variant="body2">
                  {row.original.start_date ? new Date(row.original.start_date).toLocaleDateString() : 'N/A'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  to {row.original.end_date ? new Date(row.original.end_date).toLocaleDateString() : 'N/A'}
                </Typography>
              </Box>
            </Box>
          ),
        }),
        columnHelper.accessor('library', {
          header: 'Library',
          cell: ({ row }) => (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <LibraryBooksIcon sx={{ color: 'text.secondary', mr: 1.5, fontSize: '1.25rem' }} />
                <Typography variant="body2">{row.original.library ? row.original.library.name : 'No Library'}</Typography>
            </Box>
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
        columnHelper.accessor('download_url', {
          header: 'Actions',
          cell: ({ row }) => (
            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
              {row.original.download_url && (
                <Tooltip title="View File">
                  <IconButton
                    size="small"
                    color="primary"
                    href={`${BASE_URL}${row.original.download_url}?view=true`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Visibility fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {row.original.status === 'terminer' && (
                <Tooltip title="Export as PDF">
                  <IconButton
                    size="small"
                    color="secondary"
                    onClick={() => handleExport(row.original.id, `report_${row.original.id}`)}
                  >
                    <Download fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          ),
          enableSorting: false,
        }),
      ];

      if (!missionId) {
        baseColumns.splice(2, 0, columnHelper.accessor('mission_name', {
          header: 'Mission Name',
          cell: ({ row }) => <Typography variant="body2" sx={{ fontWeight: 500 }}>{row.original.mission_name || 'N/A'}</Typography>,
        }));
      }

      return baseColumns;
    },
    [missionId, handleExport]
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
    <Card sx={{ m: { xs: 2, md: 4 }, borderRadius: 2, boxShadow: 3 }}>
      <CardHeader
        title={<Typography variant="h5" sx={{ fontWeight: 600 }}>{missionId ? `Reports for Mission #${missionId}` : 'All Reports'}</Typography>}
        action={
          <Box sx={{ p: 2 }}>
            <DebouncedInput
              value={globalFilter ?? ''}
              onChange={(value) => setGlobalFilter(String(value))}
              placeholder="Search by subject..."
            />
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
                    <Typography sx={{ mt: 2 }}>Loading reports...</Typography>
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={columns.length} align="center" sx={{ py: 10 }}>
                        <Typography color="text.secondary">
                            {missionId ? 'No reports found for this mission.' : 'No reports found.'}
                        </Typography>
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

export default InvoiceListTable;
