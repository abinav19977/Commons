export type EmployeeView = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  department: string | null;
  employmentType: string;
  joiningDate: string | null;
  monthlySalaryPaise: number;
  pan: string | null;
  aadhaarLast4: string | null;
  address: string | null;
  emergencyContact: string | null;
  status: string;
};

export const demoEmployee: EmployeeView = {
  id: "demo-ananya-rao",
  name: "Ananya Rao",
  phone: "9988776655",
  email: "ananya@commons.example",
  role: "Operations Manager",
  department: "Operations",
  employmentType: "full_time",
  joiningDate: "2025-04-15",
  monthlySalaryPaise: 6500000,
  pan: "ABCDE1234F",
  aadhaarLast4: "4821",
  address: "Indiranagar, Bengaluru, Karnataka",
  emergencyContact: "+91 98765 43210",
  status: "active",
};

export const demoEmployees: EmployeeView[] = [];
