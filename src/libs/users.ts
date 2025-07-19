import axios, { AxiosError } from 'axios';
import type { UsersType } from '@/types/apps/userTypes';

// Interface pour la réponse de l'API GET /api/users
interface UsersResponse {
  users: UsersType[];
  total: number;
  page: number;
  per_page: number;
}

// Configuration de l'instance Axios
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Ajout de l'intercepteur pour inclure le token JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken'); // Supposons que next-auth stocke le token ici
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Récupérer la liste des utilisateurs
export const getUsers = async (page: number, perPage: number, search?: string): Promise<UsersResponse> => {
  try {
    const params = { page, per_page: perPage, search };
    const response = await api.get<UsersResponse>('/users', { params });
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
};

// Créer un nouvel utilisateur
export const createUser = async (user: {
  fullname: string;
  username: string;
  email: string;
  phone_number: string;
  role: string;
  password: string;
}): Promise<void> => {
  try {
    await api.post('/users', user);
  } catch (error) {
    throw handleApiError(error);
  }
};

// Mettre à jour un utilisateur
export const updateUser = async (
  id: number,
  user: {
    fullname: string;
    username: string;
    email: string;
    phone_number: string;
    role: string;
    password?: string;
  },
): Promise<void> => {
  try {
    const payload = user.password ? user : { ...user, password: undefined };
    await api.put(`/users/${id}`, payload);
  } catch (error) {
    throw handleApiError(error);
  }
};

// Supprimer un utilisateur
export const deleteUser = async (id: number): Promise<void> => {
  try {
    await api.delete(`/users/${id}`);
  } catch (error) {
    throw handleApiError(error);
  }
};

// Gérer les erreurs de l'API
const handleApiError = (error: unknown): Error => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    return new Error(
      axiosError.response?.data?.error ||
        `API request failed: ${axiosError.message}`,
    );
  }
  return new Error('An unexpected error occurred');
};
