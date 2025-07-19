'use client';

import { useState, useEffect } from 'react';
import { styled } from '@mui/material/styles';
import Grid from '@mui/material/Grid2';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import MuiStepper from '@mui/material/Stepper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import FormHelperText from '@mui/material/FormHelperText';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Box from '@mui/material/Box';
import type { StepperProps } from '@mui/material/Stepper';
import { Controller, useForm } from 'react-hook-form';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { object, string, nonEmpty, pipe, array, minLength, custom, optional, any as vAny } from 'valibot';
import { toast } from 'react-toastify';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import StepperWrapper from '@core/styles/stepper';
import StepperCustomDot from '@components/stepper-dot';
import DirectionalIcon from '@components/DirectionalIcon';

// Styled Components
const Stepper = styled(MuiStepper)<StepperProps>(({ theme }) => ({
  justifyContent: 'center',
  background: 'linear-gradient(45deg, #f5f7fa 30%, #e3e7eb 90%)',
  padding: theme.spacing(2),
  borderRadius: theme.shape.borderRadius,
  '& .MuiStep-root': {
    '&:first-of-type': {
      paddingInlineStart: 0,
    },
    '&:last-of-type': {
      paddingInlineEnd: 0,
    },
    [theme.breakpoints.down('md')]: {
      paddingInline: theme.spacing(1),
    },
  },
  '& .MuiStepLabel-label': {
    fontWeight: 600,
    color: theme.palette.text.primary,
  },
}));

const StyledCard = styled(Card)(({ theme }) => ({
  boxShadow: theme.shadows[4],
  borderRadius: theme.shape.borderRadius * 2,
  background: 'linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)',
  margin: theme.spacing(2),
  overflow: 'hidden',
}));

const StyledButton = styled(Button)(({ theme }) => ({
  borderRadius: theme.shape.borderRadius,
  textTransform: 'none',
  fontWeight: 600,
  padding: theme.spacing(1, 3),
  '&:hover': {
    transform: 'translateY(-2px)',
    transition: 'transform 0.2s ease-in-out',
  },
}));

// Steps Definition
const steps = [
  {
    title: 'Client',
    subtitle: 'Select or create a client',
  },
  {
    title: 'Mission Details',
    subtitle: 'Enter fiscal year, mission details, price, and number of reports',
  },
  {
    title: 'Reports',
    subtitle: 'Configure report details, status, and select library',
  },
];

// Valid Statuses
const validStatuses = ['encours', 'terminer'] as const;

// MODIFICATION: Add validation for the file (optional)
const fileSchema = optional(vAny([
    custom(value => value instanceof File, 'Must be a file'),
    custom(value => value === null, 'Must be null')
]));

// Validation Schemas
const clientSchema = object({
  client_id: pipe(
    string(),
    nonEmpty('Client is required'),
    custom(
      (value) => {
        const num = Number(value);
        return !isNaN(num) && num >= 1 && num <= Number.MAX_SAFE_INTEGER;
      },
      'Invalid client ID'
    )
  ),
});

const detailsSchema = object({
  mission_name: pipe(string(), nonEmpty('Mission name is required')),
  fiscal_year: pipe(string(), nonEmpty('Fiscal year is required'), minLength(4, 'Enter a valid year (e.g., 2023)')),
  number_of_reports: pipe(
    string(),
    nonEmpty('Number of reports is required'),
    custom(
      (value) => {
        const num = Number(value);
        return !isNaN(num) && num >= 1 && num <= 100;
      },
      'Invalid number of reports (1 to 100)'
    )
  ),
  price: pipe(
    string(),
    nonEmpty('Price is required'),
    custom(
      (value) => {
        const num = Number(value);
        return !isNaN(num) && num >= 0 && num <= 9999999.99;
      },
      'Invalid price (0 to 9,999,999.99)'
    )
  ),
  status: pipe(
    string(),
    nonEmpty('Status is required'),
    custom((value) => ['active', 'inactive', 'pending'].includes(value), `Status must be one of active, inactive, pending`)
  ),
});

const reportSchema = object({
  id: optional(
    pipe(
      string(),
      custom(
        (value) => {
          if (!value) return true;
          const num = Number(value);
          return !isNaN(num) && num >= 0 && num <= Number.MAX_SAFE_INTEGER;
        },
        'Invalid report ID'
      )
    )
  ),
  start_date: pipe(
    string(),
    nonEmpty('Start date is required'),
    custom(
      (value) => {
        const date = new Date(value);
        return !isNaN(date.getTime());
      },
      'Invalid start date format (YYYY-MM-DD)'
    )
  ),
  end_date: pipe(
    string(),
    nonEmpty('End date is required'),
    custom(
      (value) => {
        const date = new Date(value);
        return !isNaN(date.getTime());
      },
      'Invalid end date format (YYYY-MM-DD)'
    )
  ),
  audit_subject: pipe(string(), nonEmpty('Audit subject is required')),
  library_id: optional(
    pipe(
      string(),
      custom(
        (value) => {
          if (!value) return true;
          const num = Number(value);
          return !isNaN(num) && num >= 1 && num <= Number.MAX_SAFE_INTEGER;
        },
        'Invalid library ID'
      )
    )
  ),
  report_status: pipe(
    string(),
    nonEmpty('Report status is required'),
    custom((value) => validStatuses.includes(value as any), `Report status must be one of ${validStatuses.join(', ')}`)
  ),
  // MODIFICATION: Add file to the schema
  file: fileSchema,
});

const reportsSchema = object({
  reports: pipe(array(reportSchema), minLength(1, 'At least one report is required')),
});

const newClientSchema = object({
  company_name: pipe(string(), nonEmpty('Company name is required')),
  secteur_d_activite: pipe(string(), nonEmpty('Sector is required')),
  status: pipe(
    string(),
    nonEmpty('Status is required'),
    custom((value) => ['active', 'inactive'].includes(value), 'Status must be active or inactive')
  ),
  price: pipe(
    string(),
    nonEmpty('Price is required'),
    custom(
      (value) => {
        const num = Number(value);
        return !isNaN(num) && num >= 0 && num <= 9999999.99;
      },
      'Invalid price (0 to 9,999,999.99)'
    )
  ),
});

type ClientType = {
  id: number;
  company_name: string;
  secteur_d_activite: string;
  status: string;
  price?: number;
};

type LibraryType = {
  id: number;
  name: string;
  number_of_section: number;
  type: '1' | '2';
};

// MODIFICATION: Add file property to ReportType
type ReportType = {
  id?: string;
  start_date: string;
  end_date: string;
  audit_subject: string;
  library_id?: string;
  report_status: string;
  file?: File | null;
};

type ProjectType = {
  id?: number;
  mission_name: string;
  fiscal_year: string;
  client_name: string;
  status: string;
  client_id: number;
  number_of_report: number;
  price: number;
};

const ProjectInformation = ({ editProject, onSubmit }: { editProject?: ProjectType; onSubmit?: () => void }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [clients, setClients] = useState<ClientType[]>([]);
  const [libraries, setLibraries] = useState<LibraryType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientType | null>(null);
  const [missionId, setMissionId] = useState<number | null>(null);
  const [openClientDialog, setOpenClientDialog] = useState(false);
  const [numberOfReports, setNumberOfReports] = useState(1);
  const router = useRouter();
  const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  const axiosInstance = axios.create({
    baseURL: BASE_URL,
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
  });

  const fetchWithRetry = async (url: string, retries = 3, delay = 1000): Promise<any> => {
    try {
      console.log(`Fetching from: ${BASE_URL}${url}`);
      const response = await axiosInstance.get(url);
      console.log(`Fetched data from ${url}:`, response.data);
      return response;
    } catch (error: any) {
      console.error(`Error fetching ${url}:`, error);
      if (retries > 0 && error.code === 'ECONNREFUSED') {
        console.log(`Retrying ${url}... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(url, retries - 1, delay * 2);
      }
      throw error;
    }
  };

  const fetchClients = async (query: string = '') => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithRetry(`/api/clients${query ? `?search=${encodeURIComponent(query)}` : ''}`);
      setClients(
        (response.data.clients || []).map((client: any) => ({
          ...client,
          id: Number(client.id),
          price: Number(client.price || 0),
        }))
      );
    } catch (error: any) {
      const errorMessage =
        error.response?.status === 404
          ? 'No clients found'
          : error.response?.data?.error || `Failed to fetch clients: ${error.message}`;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const fetchLibraries = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithRetry('/api/libraries');
      const fetchedLibraries = (response.data.libraries || []).map((library: any) => ({
        id: Number(library.id),
        name: library.name,
        number_of_section: Number(library.number_of_section),
        type: library.type,
      }));
      setLibraries(fetchedLibraries);
      if (fetchedLibraries.length === 0) {
        toast.warning('No libraries available. Please create a library first.');
      }
    } catch (error: any) {
      const errorMessage =
        error.response?.status === 404
          ? 'No libraries found'
          : error.response?.data?.error || `Failed to fetch libraries: ${error.message}`;
      setError(errorMessage);
      toast.error(errorMessage);
      setLibraries([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchReports = async (missionId: number) => {
    try {
      const response = await fetchWithRetry(`/api/reports?mission_id=${missionId}`);
      return (response.data.reports || []).map((report: any) => ({
        id: report.id ? String(report.id) : '',
        start_date: report.start_date || '',
        end_date: report.end_date || '',
        audit_subject: report.audit_subject || '',
        library_id: report.library_id ? String(report.library_id) : '',
        report_status: report.status || 'encours',
        file: null, // Initialize file as null
      }));
    } catch (error: any) {
      const errorMessage =
        error.response?.status === 404
          ? 'No reports found'
          : error.response?.data?.error || `Failed to fetch reports: ${error.message}`;
      setError(errorMessage);
      toast.error(errorMessage);
      return [];
    }
  };

  const fetchClientById = async (clientId: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithRetry(`/api/clients/${clientId}`);
      const client = {
        id: Number(response.data.id),
        company_name: response.data.company_name,
        secteur_d_activite: response.data.secteur_d_activite || '',
        status: response.data.status || 'active',
        price: Number(response.data.price || 0),
      };
      setSelectedClient(client);
      setClientValue('client_id', String(client.id));
    } catch (error: any) {
      const errorMessage = `Failed to fetch client details: ${error.response?.data?.error || error.message}`;
      setError(errorMessage);
      toast.error(errorMessage);
      setActiveStep(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
    fetchLibraries();
    if (editProject && editProject.client_id) {
      fetchClientById(editProject.client_id);
    }
  }, [editProject]);

  const {
    control: clientControl,
    handleSubmit: handleClientSubmit,
    formState: { errors: clientErrors },
    setValue: setClientValue,
    reset: clientReset,
  } = useForm({
    resolver: valibotResolver(clientSchema),
    defaultValues: { client_id: '' },
  });

  const {
    control: detailsControl,
    handleSubmit: handleDetailsSubmit,
    formState: { errors: detailsErrors },
    reset: detailsReset,
    getValues: getDetailsValues,
    watch: detailsWatch,
  } = useForm({
    resolver: valibotResolver(detailsSchema),
    defaultValues: {
      mission_name: '',
      fiscal_year: '',
      number_of_reports: '1',
      price: '0',
      status: 'active',
    },
  });

  const {
    control: reportsControl,
    handleSubmit: handleReportsSubmit,
    formState: { errors: reportsErrors },
    reset: reportsReset,
    setValue: setReportsValue,
    getValues: getReportsValues,
  } = useForm({
    resolver: valibotResolver(reportsSchema),
    // MODIFICATION: Add 'file' to default report values
    defaultValues: {
      reports: [{ id: '', start_date: '', end_date: '', audit_subject: '', library_id: '', report_status: 'encours', file: null }],
    },
  });

  const {
    control: newClientControl,
    handleSubmit: handleNewClientSubmit,
    formState: { errors: newClientErrors },
    reset: newClientReset,
  } = useForm({
    resolver: valibotResolver(newClientSchema),
    defaultValues: {
      company_name: '',
      secteur_d_activite: '',
      status: 'active',
      price: '0',
    },
  });

  useEffect(() => {
    if (editProject) {
      setClientValue('client_id', String(editProject.client_id || ''));
      detailsReset({
        mission_name: editProject.mission_name || '',
        fiscal_year: editProject.fiscal_year || '',
        number_of_reports: String(editProject.number_of_report || '1'),
        price: String(editProject.price || '0'),
        status: editProject.status || 'active',
      });
      setMissionId(editProject.id || null);
      setNumberOfReports(editProject.number_of_report || 1);

      if (editProject.id) {
        fetchReports(editProject.id).then(reports => {
          if (reports.length > 0) {
            setReportsValue('reports', reports);
            setNumberOfReports(reports.length);
          } else {
            setReportsValue(
              'reports',
              Array(editProject.number_of_report || 1).fill({
                id: '',
                start_date: '',
                end_date: '',
                audit_subject: '',
                library_id: '',
                report_status: 'encours',
                file: null, // MODIFICATION
              })
            );
          }
        });
      }
    }
  }, [editProject, setClientValue, detailsReset, setReportsValue]);

  const numberOfReportsWatcher = detailsWatch('number_of_reports');

  useEffect(() => {
    const currentReports = Number(numberOfReportsWatcher);
    if (currentReports !== numberOfReports && currentReports >= 1 && currentReports <= 100) {
      setNumberOfReports(currentReports);
      const currentReportsArray = getReportsValues('reports') || [];
      const newReportsArray = Array(currentReports)
        .fill(null)
        .map((_, index) => currentReportsArray[index] || {
          id: '',
          start_date: '',
          end_date: '',
          audit_subject: '',
          library_id: '',
          report_status: 'encours',
          file: null, // MODIFICATION
        });
      setReportsValue('reports', newReportsArray);
    }
  }, [numberOfReportsWatcher, numberOfReports, setReportsValue, getReportsValues]);

  const onClientSubmit = async (data: { client_id: string }) => {
    const client_id = Number(data.client_id);
    const client = clients.find(c => c.id === client_id);
    if (client) {
      setSelectedClient(client);
      if (libraries.length === 0) {
        setError('No libraries available. Please create a library first.');
        toast.error('No libraries available. Please create a library first.');
        return;
      }
      setActiveStep(1);
    } else {
      setOpenClientDialog(true);
      toast.warning('Client not found. Please create a new client.');
    }
  };

  const onCreateClient = async (data: any) => {
    setLoading(true);
    setError(null);
    try {
      console.log(`Creating client at: ${BASE_URL}/api/clients`);
      const response = await axiosInstance.post('/api/clients', {
        company_name: data.company_name,
        secteur_d_activite: data.secteur_d_activite,
        status: data.status,
        price: Number(data.price),
      });
      const newClient = { ...response.data, id: Number(response.data.id), price: Number(response.data.price || 0) };
      setClients([...clients, newClient]);
      setSelectedClient(newClient);
      setClientValue('client_id', String(newClient.id));
      setOpenClientDialog(false);
      newClientReset();
      toast.success('Client created successfully');
      setActiveStep(1);
    } catch (error: any) {
      const errorMessage =
        error.response?.status === 400
          ? error.response?.data?.error || 'Invalid client data'
          : error.response?.data?.error || `Failed to create client: ${error.message}`;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const onDetailsSubmit = async (data: any) => {
    setLoading(true);
    setError(null);
    try {
      if (!selectedClient || !selectedClient.id) {
        setError('No client selected. Please select or create a client in the previous step.');
        toast.error('No client selected. Please select or create a client in the previous step.');
        setActiveStep(0);
        return;
      }
      const client_id = Number(selectedClient.id);
      if (isNaN(client_id) || client_id < 1) {
        setError('Invalid client ID. Please select a valid client.');
        toast.error('Invalid client ID. Please select a valid client.');
        setActiveStep(0);
        return;
      }
      const status = data.status;
      if (!['active', 'inactive', 'pending'].includes(status)) {
        setError(`Invalid status: ${status}. Must be one of active, inactive, pending`);
        toast.error(`Invalid status: ${status}. Must be one of active, inactive, pending`);
        return;
      }
      const payload = {
        mission_name: data.mission_name,
        fiscal_year: data.fiscal_year,
        client_name: selectedClient.company_name,
        status,
        client_id: client_id,
        price: Number(data.price),
        number_of_report: Number(data.number_of_reports),
      };
      console.log(`Saving mission at: ${BASE_URL}/api/missions${missionId ? `/${missionId}` : ''}`, payload);
      let response;
      if (editProject && missionId) {
        response = await axiosInstance.put(`/api/missions/${missionId}`, payload);
      } else {
        response = await axiosInstance.post('/api/missions', payload);
        setMissionId(response.data.id);
      }
      toast.success('Mission details saved successfully');
      setActiveStep(2);
    } catch (error: any) {
      const errorMessage =
        error.response?.status === 400
          ? error.response?.data?.error || 'Invalid mission data'
          : error.response?.status === 404
          ? 'Client not found'
          : error.response?.data?.error || `Failed to save mission: ${error.message}`;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // MODIFICATION: Rework onFinalSubmit to handle file uploads with FormData
  const onFinalSubmit = async (data: { reports: ReportType[] }) => {
    if (!missionId) {
      setError('Mission not created. Please go back and complete mission details.');
      toast.error('Mission not created. Please go back and complete mission details.');
      setActiveStep(1);
      return;
    }
    if (data.reports.length !== numberOfReports) {
      setError(`Expected ${numberOfReports} reports, but received ${data.reports.length}`);
      toast.error(`Expected ${numberOfReports} reports, but received ${data.reports.length}`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      for (const report of data.reports) {
        const startDate = new Date(report.start_date);
        const endDate = new Date(report.end_date);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error('Invalid date format. Use YYYY-MM-DD');
        }
        if (startDate >= endDate) {
          throw new Error('End date must be after start date');
        }
        if (report.library_id && !libraries.find(lib => lib.id === Number(report.library_id))) {
          throw new Error(`Library ${report.library_id} is not available`);
        }

        const library = report.library_id ? libraries.find(lib => lib.id === Number(report.library_id)) : null;
        const reportType = library ? library.type : '2';

        // Create a FormData object for each report
        const formData = new FormData();

        // Append all text fields
        formData.append('type', reportType);
        formData.append('start_date', report.start_date);
        formData.append('end_date', report.end_date);
        formData.append('audit_subject', report.audit_subject);
        formData.append('mission_id', String(missionId));
        if (report.library_id) {
          formData.append('library_id', String(report.library_id));
        }
        formData.append('status', report.report_status);

        // Append the file if it exists
        if (report.file) {
          formData.append('file', report.file);
        }

        // The backend `create_report` expects multipart/form-data
        // We will assume for now we only create reports, as updating files is more complex.
        const method = 'POST'; // Note: your backend does not have a PUT endpoint for reports
        const url = '/api/reports';
        console.log(`Saving report with FormData at: ${BASE_URL}${url}`);

        const response = await axios({
            method: method,
            url: `${BASE_URL}${url}`,
            data: formData,
            headers: {
                // IMPORTANT: Let the browser set the Content-Type header with the correct boundary
                'Content-Type': 'multipart/form-data',
            }
        });

        console.log('Report created/updated:', response.data);
      }
      toast.success('Mission and reports saved successfully');
      if (onSubmit) onSubmit();
      router.push('/projects');
      handleReset();
    } catch (error: any) {
      const errorMessage =
        error.response?.status === 400
          ? error.response?.data?.error || 'Invalid report data'
          : error.response?.status === 404
          ? 'Library or mission not found'
          : error.response?.data?.error || `Failed to save reports: ${error.message}`;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    clientReset();
    detailsReset();
    reportsReset();
    setSelectedClient(null);
    setMissionId(null);
    setNumberOfReports(1);
    setActiveStep(0);
    setError(null);
  };

  const handleBack = () => {
    setError(null);
    setActiveStep(prev => prev - 1);
  };

  return (
    <StyledCard>
      <CardHeader
        title={editProject ? 'Edit Mission' : 'Create Mission'}
        sx={{ bgcolor: 'primary.light', color: 'primary.contrastText', py: 3 }}
      />
      <CardContent sx={{ position: 'relative', minHeight: 400 }}>
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              bgcolor: 'rgba(255, 255, 255, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <CircularProgress color="primary" />
          </Box>
        )}
        <StepperWrapper>
          <Stepper activeStep={activeStep} connector={<DirectionalIcon />}>
            {steps.map((step, index) => (
              <Step key={index}>
                <StepLabel StepIconComponent={StepperCustomDot}>
                  <div className="step-label">
                    <Typography className="step-title" variant="h6">{step.title}</Typography>
                    <Typography className="step-subtitle" variant="body2" color="text.secondary">{step.subtitle}</Typography>
                  </div>
                </StepLabel>
              </Step>
            ))}
          </Stepper>
        </StepperWrapper>
        <Divider sx={{ my: 4, borderColor: 'divider' }} />
        {error && (
          <Alert
            severity="error"
            sx={{
              mb: 4,
              bgcolor: 'error.light',
              color: 'error.contrastText',
              borderRadius: 1,
              '& .MuiAlert-icon': { color: 'error.contrastText' },
            }}
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        )}
        {activeStep === 0 && (
          <form onSubmit={handleClientSubmit(onClientSubmit)}>
            <Grid container spacing={4}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Controller
                  name="client_id"
                  control={clientControl}
                  render={({ field }) => (
                    <Tooltip title="Search for an existing client or create a new one">
                      <Autocomplete
                        options={clients}
                        getOptionLabel={(option: ClientType) => option.company_name}
                        onChange={(_, value) => {
                          field.onChange(value ? String(value.id) : '');
                          if (!value) {
                            setOpenClientDialog(true);
                          }
                        }}
                        onInputChange={(_, value) => fetchClients(value)}
                        renderInput={params => (
                          <TextField
                            {...params}
                            label="Search or Create Client"
                            error={!!clientErrors.client_id}
                            helperText={clientErrors.client_id?.message}
                            disabled={loading}
                            sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
                          />
                        )}
                        noOptionsText="No clients found. Create a new client."
                      />
                    </Tooltip>
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12 }} container justifyContent="flex-end">
                <StyledButton
                  variant="contained"
                  type="submit"
                  disabled={loading}
                  endIcon={loading ? <CircularProgress size={20} /> : null}
                  aria-label="Proceed to mission details"
                >
                  Next
                </StyledButton>
              </Grid>
            </Grid>
          </form>
        )}
        {activeStep === 1 && (
          <form onSubmit={handleDetailsSubmit(onDetailsSubmit)}>
            <Grid container spacing={4}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Controller
                  name="mission_name"
                  control={detailsControl}
                  render={({ field }) => (
                    <Tooltip title="Enter the name of the mission">
                      <TextField
                        {...field}
                        fullWidth
                        label="Mission Name"
                        error={!!detailsErrors.mission_name}
                        helperText={detailsErrors.mission_name?.message}
                        disabled={loading}
                        sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
                      />
                    </Tooltip>
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Controller
                  name="fiscal_year"
                  control={detailsControl}
                  render={({ field }) => (
                    <Tooltip title="Enter the fiscal year (e.g., 2023)">
                      <TextField
                        {...field}
                        fullWidth
                        label="Fiscal Year"
                        error={!!detailsErrors.fiscal_year}
                        helperText={detailsErrors.fiscal_year?.message}
                        disabled={loading}
                        sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
                      />
                    </Tooltip>
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Controller
                  name="number_of_reports"
                  control={detailsControl}
                  render={({ field }) => (
                    <Tooltip title="Specify the number of reports (1-100)">
                      <TextField
                        {...field}
                        type="number"
                        fullWidth
                        label="Number of Reports"
                        error={!!detailsErrors.number_of_reports}
                        helperText={detailsErrors.number_of_reports?.message}
                        inputProps={{ min: 1, max: 100 }}
                        disabled={loading}
                        sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
                      />
                    </Tooltip>
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Controller
                  name="price"
                  control={detailsControl}
                  render={({ field }) => (
                    <Tooltip title="Enter the mission price">
                      <TextField
                        {...field}
                        type="number"
                        fullWidth
                        label="Price"
                        error={!!detailsErrors.price}
                        helperText={detailsErrors.price?.message}
                        inputProps={{ min: 0, max: 9999999.99, step: '0.01' }}
                        disabled={loading}
                        sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
                      />
                    </Tooltip>
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Controller
                  name="status"
                  control={detailsControl}
                  render={({ field }) => (
                    <Tooltip title="Select the mission status">
                      <FormControl fullWidth error={!!detailsErrors.status} disabled={loading}>
                        <InputLabel>Status</InputLabel>
                        <Select {...field} label="Status" sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
                          <MenuItem value="active">Active</MenuItem>
                          <MenuItem value="inactive">Inactive</MenuItem>
                          <MenuItem value="pending">Pending</MenuItem>
                        </Select>
                        <FormHelperText>{detailsErrors.status?.message}</FormHelperText>
                      </FormControl>
                    </Tooltip>
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12 }} container justifyContent="space-between">
                <StyledButton
                  variant="outlined"
                  onClick={handleBack}
                  disabled={loading}
                  aria-label="Back to client selection"
                >
                  Back
                </StyledButton>
                <StyledButton
                  variant="contained"
                  type="submit"
                  disabled={loading}
                  endIcon={loading ? <CircularProgress size={20} /> : null}
                  aria-label="Proceed to report details"
                >
                  Next
                </StyledButton>
              </Grid>
            </Grid>
          </form>
        )}
        {activeStep === 2 && (
          <form onSubmit={handleReportsSubmit(onFinalSubmit)}>
            <Grid container spacing={4}>
              {Array.from({ length: numberOfReports }, (_, index) => (
                <Grid size={{ xs: 12 }} key={index}>
                  <Card
                    variant="outlined"
                    sx={{
                      boxShadow: 3,
                      borderRadius: 2,
                      bgcolor: 'background.paper',
                      '&:hover': { boxShadow: 6 },
                    }}
                  >
                    <CardHeader
                      title={`Report ${index + 1}`}
                      sx={{ bgcolor: 'secondary.light', color: 'secondary.contrastText' }}
                    />
                    <CardContent>
                      <Grid container spacing={4}>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Controller
                            name={`reports[${index}].start_date`}
                            control={reportsControl}
                            render={({ field }) => (
                              <Tooltip title="Select the report start date">
                                <TextField
                                  {...field}
                                  type="date"
                                  fullWidth
                                  label="Start Date"
                                  InputLabelProps={{ shrink: true }}
                                  error={!!reportsErrors.reports?.[index]?.start_date}
                                  helperText={reportsErrors.reports?.[index]?.start_date?.message}
                                  disabled={loading}
                                  sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
                                />
                              </Tooltip>
                            )}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Controller
                            name={`reports[${index}].end_date`}
                            control={reportsControl}
                            render={({ field }) => (
                              <Tooltip title="Select the report end date">
                                <TextField
                                  {...field}
                                  type="date"
                                  fullWidth
                                  label="End Date"
                                  InputLabelProps={{ shrink: true }}
                                  error={!!reportsErrors.reports?.[index]?.end_date}
                                  helperText={reportsErrors.reports?.[index]?.end_date?.message}
                                  disabled={loading}
                                  sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
                                />
                              </Tooltip>
                            )}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Controller
                            name={`reports[${index}].audit_subject`}
                            control={reportsControl}
                            render={({ field }) => (
                              <Tooltip title="Enter the audit subject for the report">
                                <TextField
                                  {...field}
                                  fullWidth
                                  label="Audit Subject"
                                  error={!!reportsErrors.reports?.[index]?.audit_subject}
                                  helperText={reportsErrors.reports?.[index]?.audit_subject?.message}
                                  disabled={loading}
                                  sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
                                />
                              </Tooltip>
                            )}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Controller
                            name={`reports[${index}].library_id`}
                            control={reportsControl}
                            render={({ field }) => (
                              <Tooltip title="Select a library or leave as 'No Library'">
                                <Autocomplete
                                  options={[{ id: 0, name: 'No Library', number_of_section: 0, type: '2' }, ...libraries]}
                                  getOptionLabel={(option: LibraryType) => option.name}
                                  onChange={(_, value) => field.onChange(value && value.id !== 0 ? String(value.id) : '')}
                                  renderInput={params => (
                                    <TextField
                                      {...params}
                                      label="Library"
                                      error={!!reportsErrors.reports?.[index]?.library_id}
                                      helperText={reportsErrors.reports?.[index]?.library_id?.message}
                                      disabled={loading}
                                      sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
                                    />
                                  )}
                                />
                              </Tooltip>
                            )}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Controller
                            name={`reports[${index}].report_status`}
                            control={reportsControl}
                            render={({ field }) => (
                              <Tooltip title="Select the report status">
                                <FormControl
                                  fullWidth
                                  error={!!reportsErrors.reports?.[index]?.report_status}
                                  disabled={loading}
                                >
                                  <InputLabel>Report Status</InputLabel>
                                  <Select
                                    {...field}
                                    label="Report Status"
                                    sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
                                  >
                                    <MenuItem value="encours">En Cours</MenuItem>
                                    <MenuItem value="terminer">Terminé</MenuItem>
                                  </Select>
                                  <FormHelperText>{reportsErrors.reports?.[index]?.report_status?.message}</FormHelperText>
                                </FormControl>
                              </Tooltip>
                            )}
                          />
                        </Grid>
                         {/* MODIFICATION: Add the File Upload button and display file name */}
                        <Grid size={{ xs: 12, md: 6 }} display="flex" alignItems="center">
                             <Controller
                                name={`reports[${index}].file`}
                                control={reportsControl}
                                render={({ field: { onChange, value } }) => (
                                    <Box>
                                        <Button
                                            variant="contained"
                                            component="label"
                                            disabled={loading}
                                        >
                                            Upload Report File
                                            <input
                                                type="file"
                                                hidden
                                                onChange={(e) => {
                                                    const file = e.target.files ? e.target.files[0] : null;
                                                    onChange(file);
                                                }}
                                                accept=".pdf,.doc,.docx"
                                            />
                                        </Button>
                                        {value && <Typography sx={{ ml: 2, display: 'inline' }}>{value.name}</Typography>}
                                    </Box>
                                )}
                            />
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
              <Grid size={{ xs: 12 }} container justifyContent="space-between">
                <StyledButton
                  variant="outlined"
                  onClick={handleBack}
                  disabled={loading}
                  aria-label="Back to mission details"
                >
                  Back
                </StyledButton>
                <StyledButton
                  variant="contained"
                  type="submit"
                  disabled={loading}
                  endIcon={loading ? <CircularProgress size={20} /> : null}
                  aria-label="Submit mission and reports"
                >
                  Submit
                </StyledButton>
              </Grid>
            </Grid>
          </form>
        )}
        <Dialog open={openClientDialog} onClose={() => setOpenClientDialog(false)}>
          <DialogTitle>Create New Client</DialogTitle>
          <DialogContent>
            <form onSubmit={handleNewClientSubmit(onCreateClient)}>
              <Grid container spacing={4} sx={{pt: 1}}>
                <Grid size={{ xs: 12 }}>
                  <Controller
                    name="company_name"
                    control={newClientControl}
                    render={({ field }) => (
                      <Tooltip title="Enter the company name">
                        <TextField
                          {...field}
                          fullWidth
                          label="Company Name"
                          error={!!newClientErrors.company_name}
                          helperText={newClientErrors.company_name?.message}
                          disabled={loading}
                          sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
                        />
                      </Tooltip>
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Controller
                    name="secteur_d_activite"
                    control={newClientControl}
                    render={({ field }) => (
                      <Tooltip title="Enter the sector of activity">
                        <TextField
                          {...field}
                          fullWidth
                          label="Sector"
                          error={!!newClientErrors.secteur_d_activite}
                          helperText={newClientErrors.secteur_d_activite?.message}
                          disabled={loading}
                          sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
                        />
                      </Tooltip>
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Controller
                    name="status"
                    control={newClientControl}
                    render={({ field }) => (
                      <Tooltip title="Select the client status">
                        <FormControl fullWidth error={!!newClientErrors.status} disabled={loading}>
                          <InputLabel>Status</InputLabel>
                          <Select {...field} label="Status" sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
                            <MenuItem value="active">Active</MenuItem>
                            <MenuItem value="inactive">Inactive</MenuItem>
                          </Select>
                          <FormHelperText>{newClientErrors.status?.message}</FormHelperText>
                        </FormControl>
                      </Tooltip>
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Controller
                    name="price"
                    control={newClientControl}
                    render={({ field }) => (
                      <Tooltip title="Enter the client price">
                        <TextField
                          {...field}
                          type="number"
                          fullWidth
                          label="Price"
                          error={!!newClientErrors.price}
                          helperText={newClientErrors.price?.message}
                          inputProps={{ min: 0, max: 9999999.99, step: '0.01' }}
                          disabled={loading}
                          sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
                        />
                      </Tooltip>
                    )}
                  />
                </Grid>
              </Grid>
              <DialogActions>
                <StyledButton
                  onClick={() => setOpenClientDialog(false)}
                  disabled={loading}
                  aria-label="Cancel client creation"
                >
                  Cancel
                </StyledButton>
                <StyledButton
                  variant="contained"
                  type="submit"
                  disabled={loading}
                  endIcon={loading ? <CircularProgress size={20} /> : null}
                  aria-label="Create client"
                >
                  Create
                </StyledButton>
              </DialogActions>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </StyledCard>
  );
};

export default ProjectInformation;
