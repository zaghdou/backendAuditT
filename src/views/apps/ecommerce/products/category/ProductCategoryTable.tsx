'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, CardHeader, Alert, CircularProgress, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Button, IconButton, Typography, TextField,
  FormControl, InputLabel, Select, MenuItem, Box, Dialog, DialogTitle,
  DialogContent, DialogActions, Tooltip, Chip, Grid
} from '@mui/material';
import {
  Delete, Edit, Visibility, Download, Add as AddIcon,
  LibraryBooks as LibraryBooksIcon, FolderOpen as FolderOpenIcon,
  UploadFile as UploadFileIcon, CheckCircleOutline as CheckIcon,
  HighlightOff as CancelIcon
} from '@mui/icons-material';
import axios from 'axios';
import { toast } from 'react-toastify';
import AddCategoryDialog from './AddCategoryDialog';

// --- TYPES ---
interface Library {
  id: number;
  name: string;
  number_of_section: number;
  type: 'norme' | 'semi_norme';
}

interface Section {
  id: number;
  library_id: number;
  title: string;
  type: 'norme' | 'semi_norme' | 'libre';
  file_path: string | null;
  download_url: string | null;
  requirement_type: string | null;
}

// --- CONFIGURATION ---
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const axiosInstance = axios.create({ baseURL: BASE_URL, timeout: 15000 });

// --- COMPOSANT PRINCIPAL ---
const ProductCategoryTable: React.FC = () => {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [sectionLoading, setSectionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [openCategoryDialog, setOpenCategoryDialog] = useState<boolean>(false);
  const [selectedLibrary, setSelectedLibrary] = useState<Library | null>(null);
  const [sectionTitle, setSectionTitle] = useState<string>('');
  const [sectionType, setSectionType] = useState<string>('');
  const [sectionRequirementType, setSectionRequirementType] = useState<string>('');
  const [sectionFile, setSectionFile] = useState<File | null>(null);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [openEditDialog, setOpenEditDialog] = useState<boolean>(false);

  const sectionTypes = ['norme', 'semi_norme', 'libre'];
  const requirementTypes = ['obligatoire', 'facultative'];

  const fetchLibraries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.get('/api/libraries');
      setLibraries(response.data.libraries || []);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to fetch libraries.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSections = useCallback(async (libraryId: number) => {
    setSectionLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.get('/api/sections', { params: { library_id: libraryId } });
      setSections(response.data.sections || []);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to fetch sections.';
      setError(errorMessage);
      toast.error(errorMessage);
      setSections([]);
    } finally {
      setSectionLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLibraries();
  }, [fetchLibraries]);

  const handleDeleteLibrary = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this library and all its sections?')) return;
    try {
      await axiosInstance.delete(`/api/libraries/${id}`);
      setLibraries(libraries.filter((lib) => lib.id !== id));
      toast.success('Library deleted successfully');
      if (selectedLibrary?.id === id) {
        setSelectedLibrary(null);
        setSections([]);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete library.');
    }
  };

  const handleDeleteSection = async (sectionId: number) => {
    if (!window.confirm('Are you sure you want to delete this section?')) return;
    try {
      await axiosInstance.delete(`/api/sections/${sectionId}`);
      toast.success('Section deleted successfully');
      if (selectedLibrary) {
        fetchSections(selectedLibrary.id);
        fetchLibraries(); // To update section count
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete section.');
    }
  };

  const handleSelectLibrary = (library: Library) => {
    setSelectedLibrary(library);
    fetchSections(library.id);
  };

  const handleSaveSection = async (isEditing: boolean) => {
    const currentSectionId = isEditing ? editingSection?.id : null;
    if (!selectedLibrary && !currentSectionId) {
      toast.error('Please select a library');
      return;
    }
    if (!sectionTitle.trim() || !sectionType) {
      toast.error('Section title and type are required');
      return;
    }

    setSectionLoading(true);
    const formData = new FormData();
    formData.append('title', sectionTitle);
    formData.append('type', sectionType);
    formData.append('library_id', (selectedLibrary?.id || editingSection?.library_id)?.toString() || '');
    if (sectionFile) formData.append('file', sectionFile);
    if (sectionRequirementType) formData.append('requirement_type', sectionRequirementType);

    try {
      const url = isEditing ? `/api/sections/${currentSectionId}` : '/api/sections';
      const method = isEditing ? 'put' : 'post';
      await axiosInstance[method](url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success(`Section ${isEditing ? 'updated' : 'added'} successfully`);
      if (selectedLibrary) fetchSections(selectedLibrary.id);
      fetchLibraries();

      // Reset form
      setSectionTitle('');
      setSectionType('');
      setSectionRequirementType('');
      setSectionFile(null);
      if (isEditing) {
        setOpenEditDialog(false);
        setEditingSection(null);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || `Failed to ${isEditing ? 'update' : 'add'} section.`);
    } finally {
      setSectionLoading(false);
    }
  };

  const handleOpenEditDialog = (section: Section) => {
    setEditingSection(section);
    setSectionTitle(section.title);
    setSectionType(section.type);
    setSectionRequirementType(section.requirement_type || '');
    setSectionFile(null);
    setOpenEditDialog(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSectionFile(e.target.files[0]);
    } else {
      setSectionFile(null);
    }
  };

  // ==================== FONCTION DE TÉLÉCHARGEMENT CORRIGÉE ====================
  const handleDownloadFile = async (downloadUrl: string, title: string) => {
    try {
      const response = await axiosInstance.get(downloadUrl, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;

      const contentDisposition = response.headers['content-disposition'];
      let fileName = title;
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (fileNameMatch && fileNameMatch.length > 1) {
          fileName = fileNameMatch[1];
        }
      }

      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();

      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Download started!');
    } catch (error) {
      toast.error('Failed to download file.');
      console.error('Download error:', error);
    }
  };
  // =========================================================================

  return (
    <Grid container spacing={4}>
      {/* Libraries Column */}
      <Grid item xs={12} md={5}>
        <Card sx={{ borderRadius: 2, boxShadow: 3, height: '100%' }}>
          <CardHeader
            title={<Typography variant="h6" sx={{ fontWeight: 600 }}>Libraries</Typography>}
            action={
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenCategoryDialog(true)}>
                Add Library
              </Button>
            }
            sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
          />
          <TableContainer>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
            ) : (
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell align="center">Sections</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {libraries.map((library) => (
                    <TableRow
                      key={library.id}
                      onClick={() => handleSelectLibrary(library)}
                      selected={selectedLibrary?.id === library.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <LibraryBooksIcon sx={{ mr: 1.5, color: 'primary.main' }} />
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>{library.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{library.type}</Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={library.number_of_section} size="small" />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Delete Library">
                          <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); handleDeleteLibrary(library.id); }}>
                            <Delete />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TableContainer>
        </Card>
      </Grid>

      {/* Sections Column */}
      <Grid item xs={12} md={7}>
        <Card sx={{ borderRadius: 2, boxShadow: 3, height: '100%' }}>
          <CardHeader
            title={
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <FolderOpenIcon sx={{ mr: 1.5, color: 'text.secondary' }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {selectedLibrary ? `Sections for "${selectedLibrary.name}"` : 'Select a Library'}
                </Typography>
              </Box>
            }
            sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
          />
          {selectedLibrary && (
            <Box sx={{ p: 2 }}>
              <Box sx={{ p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 2, mb: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 2 }}>Add a New Section</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField
                      label="New Section Title"
                      value={sectionTitle}
                      onChange={(e) => setSectionTitle(e.target.value)}
                      size="small"
                      fullWidth
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl size="small" fullWidth required>
                      <InputLabel>Section Type</InputLabel>
                      <Select value={sectionType} onChange={(e) => setSectionType(e.target.value)} label="Section Type">
                        {sectionTypes.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl size="small" fullWidth>
                      <InputLabel>Requirement Type</InputLabel>
                      <Select value={sectionRequirementType} onChange={(e) => setSectionRequirementType(e.target.value)} label="Requirement Type">
                        <MenuItem value=""><em>None</em></MenuItem>
                        {requirementTypes.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12}>
                     <Button variant="outlined" component="label" startIcon={<UploadFileIcon />} fullWidth>
                        {sectionFile ? sectionFile.name : 'Upload File (Optional)'}
                        <input type="file" hidden onChange={handleFileChange} accept=".pdf,.doc,.docx" />
                      </Button>
                  </Grid>
                  <Grid item xs={12}>
                    <Button
                      variant="contained"
                      onClick={() => handleSaveSection(false)}
                      disabled={sectionLoading}
                      fullWidth
                    >
                      {sectionLoading ? <CircularProgress size={24} /> : 'Add Section'}
                    </Button>
                  </Grid>
                </Grid>
              </Box>

              {/* ==================== MODIFICATION DE LA TABLE DES SECTIONS ==================== */}
              <TableContainer>
                {sectionLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
                ) : sections.length === 0 ? (
                    <Typography sx={{textAlign: 'center', p: 4, color: 'text.secondary'}}>No sections found. Add one above.</Typography>
                ) : (
                  <Table stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Title</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>File</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sections.map((section) => (
                        <TableRow key={section.id} hover>
                          <TableCell sx={{fontWeight: 500}}>{section.title}</TableCell>
                          <TableCell><Chip label={section.type} size="small" variant="outlined" /></TableCell>
                          <TableCell>
                            {section.download_url ? (
                              <Chip
                                icon={<CheckIcon />}
                                label="Attached"
                                size="small"
                                color="success"
                                variant="outlined"
                              />
                            ) : (
                              <Chip
                                icon={<CancelIcon />}
                                label="None"
                                size="small"
                              />
                            )}
                          </TableCell>
                          <TableCell align="right">
                            {section.download_url && (
                              <>
                                <Tooltip title="View File">
                                  <IconButton size="small" href={`${BASE_URL}${section.download_url}?view=true`} target="_blank"><Visibility /></IconButton>
                                </Tooltip>
                                <Tooltip title="Download File">
                                  <IconButton size="small" onClick={() => handleDownloadFile(section.download_url!, section.title)}><Download /></IconButton>
                                </Tooltip>
                              </>
                            )}
                            <Tooltip title="Edit Section">
                              <IconButton size="small" onClick={() => handleOpenEditDialog(section)}><Edit /></IconButton>
                            </Tooltip>
                            <Tooltip title="Delete Section">
                              <IconButton size="small" color="error" onClick={() => handleDeleteSection(section.id)}><Delete /></IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TableContainer>
              {/* ========================================================================= */}
            </Box>
          )}
        </Card>
      </Grid>

      {/* Edit Dialog */}
      <Dialog open={openEditDialog} onClose={() => setOpenEditDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>Edit Section: "{editingSection?.title}"</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField label="Section Title" value={sectionTitle} onChange={(e) => setSectionTitle(e.target.value)} required fullWidth />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Section Type</InputLabel>
                <Select value={sectionType} onChange={(e) => setSectionType(e.target.value)} label="Section Type">
                  {sectionTypes.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Requirement Type</InputLabel>
                <Select value={sectionRequirementType} onChange={(e) => setSectionRequirementType(e.target.value)} label="Requirement Type">
                  <MenuItem value=""><em>None</em></MenuItem>
                  {requirementTypes.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Button variant="outlined" component="label" startIcon={<UploadFileIcon />} fullWidth>
                {sectionFile ? sectionFile.name : 'Upload New File (Optional)'}
                <input type="file" hidden onChange={handleFileChange} accept=".pdf,.doc,.docx" />
              </Button>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: '0 24px 16px' }}>
          <Button onClick={() => setOpenEditDialog(false)}>Cancel</Button>
          <Button onClick={() => handleSaveSection(true)} variant="contained" disabled={sectionLoading}>
            {sectionLoading ? <CircularProgress size={24} /> : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>

      <AddCategoryDialog open={openCategoryDialog} onClose={() => { setOpenCategoryDialog(false); fetchLibraries(); }} />
    </Grid>
  );
};

export default ProductCategoryTable;
