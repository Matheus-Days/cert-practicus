import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/certificate-form/certificate-form.component').then(
        (c) => c.CertificateFormComponent
      ),
  },
];
