/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { CustomerFormModal } from '../../features/customers/CustomerFormModal.tsx';

export const AddCustomerModal: React.FC = () => {
  const { activeQuickModal, setActiveQuickModal } = usePharmacy();

  return (
    <CustomerFormModal
      isOpen={activeQuickModal === 'customer'}
      onClose={() => setActiveQuickModal(null)}
    />
  );
};
