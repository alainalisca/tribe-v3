/** Shared return type for all DAL functions */
export interface DalResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
