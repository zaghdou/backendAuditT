import { redirect } from 'next/navigation';
import axios from 'axios';
import type { Customer } from '@/types/apps/ecommerceTypes';
import CustomerDetails from '@/views/apps/ecommerce/customers/details';

interface BackendClient {
  id: number;
  company_name: string;
  secteur_d_activite: string | null;
  status: string;
  price: number;
  number_of_active_user: number;
  number_of_active_project: number;
  total_mission_price: number;
}

interface Mission {
  id: number;
  mission_name: string;
  fiscal_year: number;
  client_name: string;
  status: string;
  client_id: number;
  number_of_report: number;
  price: number;
}

const BASE_URL = process.env.API_URL || 'http://localhost:5000';

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

const CustomerDetailsPage = async ({ params }: { params: { id: string } }) => {
  const id = params.id;

  if (!id || isNaN(Number(id))) {
    redirect('/en/not-found');
  }

  let customerData: Customer | null = null;
  let missions: Mission[] = [];

  try {
    // Fetch customer data
    const clientResponse = await axiosInstance.get<BackendClient>(`/api/clients/${id}`);
    const backendClient = clientResponse.data;

    if (!backendClient || typeof backendClient.id !== 'number') {
      console.error('Invalid customer data:', backendClient);
      redirect('/en/not-found');
    }

    customerData = {
      customerId: backendClient.id,
      customer: backendClient.company_name || 'Unknown',
      order: backendClient.number_of_active_project || 0,
      totalSpent: backendClient.total_mission_price || 0,
      email: 'N/A',
      country: 'N/A',
      status: backendClient.status?.toLowerCase() || 'unknown',
    };

    // Fetch missions data
    const missionsResponse = await axiosInstance.get(`/api/missions?client_id=${id}`);
    missions = Array.isArray(missionsResponse.data.missions) ? missionsResponse.data.missions : [];
  } catch (err: any) {
    console.error('API Error:', {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
      code: err.code,
    });
    redirect('/en/not-found');
  }

  if (!customerData) {
    redirect('/en/not-found');
  }

  return <CustomerDetails customerData={customerData} missions={missions} customerId={id} />;
};

export default CustomerDetailsPage;

