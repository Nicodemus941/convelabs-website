
/**
 * Utility functions for exporting data to various formats
 */

/**
 * Export data to CSV file and trigger download
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string,
  columns: { key: keyof T; header: string }[]
): void {
  // Create header row
  const headerRow = columns.map(col => `"${col.header}"`).join(',');
  
  // Create data rows
  const dataRows = data.map(row => {
    return columns.map(col => {
      // Handle different data types and escape quotes for CSV format
      const value = row[col.key];
      if (value === null || value === undefined) return '""';
      if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
      // Properly check if value is a Date object
      if (value && typeof value === 'object' && 'toLocaleDateString' in value) {
        return `"${value.toLocaleDateString()}"`;
      }
      return `"${value}"`;
    }).join(',');
  }).join('\n');
  
  // Combine header and data
  const csvContent = `${headerRow}\n${dataRows}`;
  
  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  // Create link to download file
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  
  // Trigger download
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export data to PDF file and trigger download
 * Uses browser's print to PDF functionality
 */
export function exportToPDF<T extends Record<string, any>>(
  data: T[],
  filename: string,
  columns: { key: keyof T; header: string }[]
): void {
  // Create a new window for the PDF content
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to export as PDF');
    return;
  }
  
  // Add styling for the PDF document
  printWindow.document.write(`
    <html>
      <head>
        <title>${filename}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            color: #333;
          }
          h1 {
            color: #2563eb;
            margin-bottom: 20px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th {
            background-color: #f3f4f6;
            text-align: left;
            padding: 10px;
            border-bottom: 2px solid #d1d5db;
            font-weight: bold;
          }
          td {
            padding: 10px;
            border-bottom: 1px solid #e5e7eb;
          }
          tr:nth-child(even) {
            background-color: #f9fafb;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            color: #6b7280;
            font-size: 12px;
          }
          .meta {
            margin-bottom: 20px;
            color: #6b7280;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <h1>${filename}</h1>
        <div class="meta">Generated on ${new Date().toLocaleString()}</div>
  `);
  
  // Add table with data
  printWindow.document.write('<table>');
  
  // Add table header
  printWindow.document.write('<thead><tr>');
  columns.forEach(column => {
    printWindow.document.write(`<th>${column.header}</th>`);
  });
  printWindow.document.write('</tr></thead>');
  
  // Add table body
  printWindow.document.write('<tbody>');
  data.forEach(item => {
    printWindow.document.write('<tr>');
    columns.forEach(column => {
      const value = item[column.key];
      let displayValue = '';
      
      // Format different types of values
      if (value === null || value === undefined) {
        displayValue = '';
      } else if (value && typeof value === 'object' && 'toLocaleDateString' in value) {
        displayValue = value.toLocaleDateString();
      } else if (typeof value === 'boolean') {
        displayValue = value ? 'Yes' : 'No';
      } else {
        displayValue = String(value);
      }
      
      printWindow.document.write(`<td>${displayValue}</td>`);
    });
    printWindow.document.write('</tr>');
  });
  printWindow.document.write('</tbody>');
  printWindow.document.write('</table>');
  
  // Add footer
  printWindow.document.write(`
        <div class="footer">
          Campaign History Report - ${filename}
        </div>
      </body>
    </html>
  `);
  
  printWindow.document.close();
  
  // Trigger print dialog after content is loaded
  printWindow.addEventListener('load', () => {
    printWindow.print();
  }, { once: true });
}
