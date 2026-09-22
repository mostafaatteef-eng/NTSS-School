// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TimetableModuleView } from './TimetableModuleView';
import { User } from '../../types';

// Tell React we are in an act-supporting test environment
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('TimetableModuleView - initialTab Prop Synchronization Regression Tests', () => {
  let container: HTMLDivElement | null = null;
  let root: any = null;

  const mockAdminUser: User = {
    id: 'U-ADMIN-TEST',
    username: 'admin',
    fullName: 'مدير النظام',
    role: 'Admin',
    sessionToken: 'BE_SECURE_ADMIN_TOKEN_12345',
  };

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('Regression Test: changing initialTab prop synchronizes active sub tab across weekly, import, load, reserve, reports without remount', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // 1. Initial render with initialTab="weekly"
    await act(async () => {
      root.render(<TimetableModuleView currentUser={mockAdminUser} initialTab="weekly" />);
    });

    let activeBtn = container.querySelector('button.bg-indigo-600');
    expect(activeBtn?.textContent).toContain('الجدول الأسبوعي');

    // 2. Update prop to "load" - proves initialTab="weekly" to initialTab="load" updates without remount
    await act(async () => {
      root.render(<TimetableModuleView currentUser={mockAdminUser} initialTab="load" />);
    });
    activeBtn = container.querySelector('button.bg-indigo-600');
    expect(activeBtn?.textContent).toContain('أنصبة المعلمين');

    // 3. Update prop to "import"
    await act(async () => {
      root.render(<TimetableModuleView currentUser={mockAdminUser} initialTab="import" />);
    });
    activeBtn = container.querySelector('button.bg-indigo-600');
    expect(activeBtn?.textContent).toContain('استيراد aSc والجدول');

    // 4. Update prop to "reserve"
    await act(async () => {
      root.render(<TimetableModuleView currentUser={mockAdminUser} initialTab="reserve" />);
    });
    activeBtn = container.querySelector('button.bg-indigo-600');
    expect(activeBtn?.textContent).toContain('حصص الاحتياطي');

    // 5. Update prop to "reports"
    await act(async () => {
      root.render(<TimetableModuleView currentUser={mockAdminUser} initialTab="reports" />);
    });
    activeBtn = container.querySelector('button.bg-indigo-600');
    expect(activeBtn?.textContent).toContain('تقارير الجدول');

    // 6. Test all remaining sidebar timetable items sync directly:
    // coverage
    await act(async () => {
      root.render(<TimetableModuleView currentUser={mockAdminUser} initialTab="coverage" />);
    });
    activeBtn = container.querySelector('button.bg-indigo-600');
    expect(activeBtn?.textContent).toContain('مطابقة الخطة');

    // supervision
    await act(async () => {
      root.render(<TimetableModuleView currentUser={mockAdminUser} initialTab="supervision" />);
    });
    activeBtn = container.querySelector('button.bg-indigo-600');
    expect(activeBtn?.textContent).toContain('جدول الإشراف');

    // locations
    await act(async () => {
      root.render(<TimetableModuleView currentUser={mockAdminUser} initialTab="locations" />);
    });
    activeBtn = container.querySelector('button.bg-indigo-600');
    expect(activeBtn?.textContent).toContain('أماكن الإشراف');

    // exams
    await act(async () => {
      root.render(<TimetableModuleView currentUser={mockAdminUser} initialTab="exams" />);
    });
    activeBtn = container.querySelector('button.bg-indigo-600');
    expect(activeBtn?.textContent).toContain('جدول الامتحانات');

    // settings
    await act(async () => {
      root.render(<TimetableModuleView currentUser={mockAdminUser} initialTab="settings" />);
    });
    activeBtn = container.querySelector('button.bg-indigo-600');
    expect(activeBtn?.textContent).toContain('إعدادات وفترات الجدول');

    // teacher_portal
    await act(async () => {
      root.render(<TimetableModuleView currentUser={mockAdminUser} initialTab="teacher_portal" />);
    });
    activeBtn = container.querySelector('button.bg-indigo-600');
    expect(activeBtn?.textContent).toContain('بوابة المعلم');

    // student_access
    await act(async () => {
      root.render(<TimetableModuleView currentUser={mockAdminUser} initialTab="student_access" />);
    });
    activeBtn = container.querySelector('button.bg-indigo-600');
    expect(activeBtn?.textContent).toContain('وصول الطلاب (QR)');

    // 7. Internal tab button clicks still work seamlessly
    const weeklyBtn = Array.from(container.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('الجدول الأسبوعي')
    );
    expect(weeklyBtn).toBeDefined();
    await act(async () => {
      weeklyBtn?.click();
    });
    activeBtn = container.querySelector('button.bg-indigo-600');
    expect(activeBtn?.textContent).toContain('الجدول الأسبوعي');

    // 8. Verify all tab buttons have type="button" attribute
    const allTabButtons = Array.from(container.querySelectorAll('button'));
    for (const btn of allTabButtons) {
      if (btn.textContent?.includes('الجدول') || btn.textContent?.includes('أنصبة') || btn.textContent?.includes('استيراد')) {
        expect(btn.getAttribute('type')).toBe('button');
      }
    }

    // Cleanup
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
