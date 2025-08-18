// Utility functions for authentication

export const getAuthenticatedUsername = (): string => {
  const userData = localStorage.getItem('rt-misra-user');
  if (userData) {
    try {
      const user = JSON.parse(userData);
      return user.username || 'defaultuser';
    } catch {
      return 'defaultuser';
    }
  }
  return 'defaultuser';
};