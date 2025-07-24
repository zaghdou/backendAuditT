// ReportConformityChatbot.tsx

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';

import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';

import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ScienceIcon from '@mui/icons-material/Science';
import DescriptionIcon from '@mui/icons-material/Description';
import DeleteIcon from '@mui/icons-material/Delete';
import ChatIcon from '@mui/icons-material/Chat';

import type { ThemeColor } from '@core/types';

interface AnalysisResult {
  final_score: number;
  summary: string;
  positive_points: string[];
  areas_for_improvement: string[];
}

interface Message {
  sender: 'user' | 'bot';
  type: 'text' | 'analysis';
  content: string | AnalysisResult;
  timestamp: string;
}

const AnalysisResultCard = ({ details }: { details: AnalysisResult }) => {
  const getScoreColor = (score: number): ThemeColor => {
    if (score < 50) return 'error';
    if (score < 85) return 'warning';
    return 'success';
  };

  return (
    <Paper elevation={2} sx={{ p: 2, mt: 1, minWidth: 400, maxWidth: 500, borderLeft: 5, borderColor: `${getScoreColor(details.final_score)}.main` }}>
      <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>Rapport de Conformité</Typography>
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
        <Chip label={`Score final : ${details.final_score} / 100`} color={getScoreColor(details.final_score)} variant="filled" sx={{ fontSize: '1rem', p: 2 }} />
      </Box>
      <Typography variant="body1" sx={{ mb: 2, fontStyle: 'italic' }}>{details.summary}</Typography>
      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle1" sx={{ color: 'success.main', fontWeight: 'bold' }}>Points Conformes</Typography>
      <List dense sx={{ mb: 2 }}>
        {details.positive_points.map((point, index) => (
          <ListItem key={index} sx={{ p: 0 }}>
            <CheckCircleIcon color="success" sx={{ mr: 1, fontSize: '1.2rem' }} />
            <ListItemText primary={point} />
          </ListItem>
        ))}
      </List>
      <Typography variant="subtitle1" sx={{ color: 'error.main', fontWeight: 'bold' }}>Axes d'Amélioration</Typography>
      <List dense>
        {details.areas_for_improvement.length > 0 ? (
          details.areas_for_improvement.map((point, index) => (
            <ListItem key={index} sx={{ p: 0 }}>
              <ErrorOutlineIcon color="error" sx={{ mr: 1, fontSize: '1.2rem' }} />
              <ListItemText primary={point} />
            </ListItem>
          ))
        ) : (
          <ListItemText primary="Aucun problème majeur identifié. Excellent travail !" />
        )}
      </List>
    </Paper>
  );
};

interface FileDropzoneProps {
  title: string;
  file: File | null;
  onDrop: (acceptedFiles: File[]) => void;
  onRemove: () => void;
}

const FileDropzone = ({ title, file, onDrop, onRemove }: FileDropzoneProps) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: false, accept: { 'application/pdf': ['.pdf'] } });
  return (
    <Box>
      <Typography variant="subtitle1" align="center" gutterBottom>{title}</Typography>
      {file ? (
        <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'action.selected' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
            <DescriptionIcon color="primary" sx={{ mr: 1.5 }} />
            <Typography noWrap variant="body2">{file.name}</Typography>
          </Box>
          <IconButton onClick={onRemove} size="small"><DeleteIcon /></IconButton>
        </Paper>
      ) : (
        <Box {...getRootProps()} sx={{ p: 4, border: '2px dashed', borderColor: isDragActive ? 'primary.main' : 'divider', backgroundColor: isDragActive ? 'action.hover' : 'transparent', textAlign: 'center', cursor: 'pointer', transition: 'background-color 0.2s, border-color 0.2s' }}>
          <input {...getInputProps()} />
          <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography>Glissez ou cliquez ici</Typography>
        </Box>
      )}
    </Box>
  );
};

const ReportConformityChatbot = () => {
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [candidateFile, setCandidateFile] = useState<File | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<null | HTMLDivElement>(null);

  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(scrollToBottom, [messages, loading]);

  const addMessage = (sender: 'user' | 'bot', type: 'text' | 'analysis', content: string | AnalysisResult) => {
    setMessages(prev => [...prev, { sender, type, content, timestamp: new Date().toLocaleTimeString() }]);
  };

  const handleAnalyze = async (retries = 3) => {
    if (!referenceFile || !candidateFile) {
      setError("Veuillez téléverser les deux rapports (référence et candidat) avant de lancer l'analyse.");
      return;
    }

    setLoading(true);
    setError(null);
    addMessage('user', 'text', `Analyse demandée pour '${candidateFile.name}' en utilisant '${referenceFile.name}' comme référence.`);
    addMessage('bot', 'text', "Les rapports sont envoyés à l'IA pour analyse. Cela peut prendre jusqu'à 30 secondes...");

    const formData = new FormData();
    formData.append('reference_pdf', referenceFile);
    formData.append('candidate_pdf', candidateFile);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios.post(`${apiUrl}/api/analyze-report`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        });
        addMessage('bot', 'analysis', response.data);
        setLoading(false);
        return;
      } catch (err: any) {
        if (attempt === retries) {
          let userFriendlyMessage = "Une erreur est survenue. Veuillez réessayer ou contacter le support.";
          if (axios.isAxiosError(err)) {
            if (err.response) {
              const apiError = err.response.data?.error;
              userFriendlyMessage = typeof apiError === 'string' ? apiError : `Erreur serveur (${err.response.status}).`;
            } else if (err.request) {
              userFriendlyMessage = "Impossible de contacter le serveur. Est-il en ligne ?";
            } else {
              userFriendlyMessage = `Erreur réseau: ${err.message}.`;
            }
          }
          setError(userFriendlyMessage);
          addMessage('bot', 'text', `Erreur : ${userFriendlyMessage}`);
          console.error('Final error after retries:', err);
        } else {
          console.warn(`Tentative ${attempt} échouée, nouvelle tentative...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    setLoading(false);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
        <ScienceIcon color="primary" sx={{ fontSize: '2.5rem', mr: 2 }} />
        <Typography variant="h4" component="h1">Analyseur de Conformité de Rapport par IA</Typography>
      </Box>
      <Grid container spacing={4}>
        <Grid item xs={12} md={5}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Configuration de l'Analyse" />
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <FileDropzone title="1. Rapport de Référence (Template)" file={referenceFile} onDrop={useCallback((files: File[]) => setReferenceFile(files[0] || null), [])} onRemove={() => setReferenceFile(null)} />
              <FileDropzone title="2. Rapport Candidat (À Analyser)" file={candidateFile} onDrop={useCallback((files: File[]) => setCandidateFile(files[0] || null), [])} onRemove={() => setCandidateFile(null)} />
              <Box sx={{ mt: 'auto', pt: 2 }}>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <Button variant="contained" size="large" fullWidth onClick={() => handleAnalyze()} disabled={!referenceFile || !candidateFile || loading} startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}>
                  {loading ? "Analyse en cours..." : "Lancer l'Analyse"}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={7}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Console de l'Analyse" avatar={<ChatIcon />} />
            <CardContent sx={{ height: 'calc(100% - 72px)', p: 0, '&:last-child': { pb: 0 } }}>
              <Box sx={{ height: '100%', position: 'relative' }}>
                <Paper square elevation={0} sx={{ height: '100%', overflowY: 'auto', p: 2, backgroundColor: 'action.hover' }}>
                  {messages.length === 0 && !loading && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
                      <ChatIcon sx={{ fontSize: '4rem', mb: 2 }} />
                      <Typography>Les résultats de l'analyse apparaîtront ici.</Typography>
                    </Box>
                  )}
                  <List>
                    {messages.map((msg, index) => (
                      <ListItem key={index} sx={{ display: 'flex', flexDirection: 'column', alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexDirection: msg.sender === 'user' ? 'row-reverse' : 'row' }}>
                          <Avatar sx={{ width: 32, height: 32 }}>{msg.sender === 'user' ? 'U' : <ScienceIcon />}</Avatar>
                          {msg.type === 'text' && typeof msg.content === 'string' ? (
                            <Paper elevation={1} sx={{ p: '10px 14px', backgroundColor: msg.sender === 'user' ? 'primary.main' : 'background.paper', color: msg.sender === 'user' ? 'primary.contrastText' : 'text.primary', borderRadius: msg.sender === 'user' ? '14px 14px 0 14px' : '14px 14px 14px 0' }}>
                              <Typography variant="body1">{msg.content}</Typography>
                            </Paper>
                          ) : (
                            <AnalysisResultCard details={msg.content as AnalysisResult} />
                          )}
                        </Box>
                        <Typography variant="caption" sx={{ mt: 0.5, color: 'text.secondary' }}>{msg.timestamp}</Typography>
                      </ListItem>
                    ))}
                    <div ref={chatEndRef} />
                  </List>
                </Paper>
                {loading && (
                  <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.7)', zIndex: 1 }}>
                    <CircularProgress />
                    <Typography sx={{ mt: 2, fontWeight: 500 }}>Analyse par l'IA en cours...</Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ReportConformityChatbot;
