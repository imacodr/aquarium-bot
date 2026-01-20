import "express";

declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      discriminator: string;
      avatar: string | null;
    }

    interface Request {
      user?: User;
      isAuthenticated(): boolean;
      isUnauthenticated(): boolean;
      logout(callback: (err: any) => void): void;
      login(user: User, callback: (err: any) => void): void;
      logIn(user: User, callback: (err: any) => void): void;
      logOut(callback: (err: any) => void): void;
    }
  }
}
