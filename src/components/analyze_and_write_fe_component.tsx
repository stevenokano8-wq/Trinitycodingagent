// src/components/analyze_and_write_fe_component.tsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

interface Folder {
  name: string;
}

const AnalyzeAndWriteFEComponent: React.FC = () => {
  const [folderName, setFolderName] = useState('');
  const [folderCreated, setFolderCreated] = useState(false);
  const navigate = useNavigate();

  const handleFolderNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFolderName(event.target.value);
  };

  const handleCreateFolder = async () => {
    try {
      const response = await axios.post('/api/create-folder', {
        name: folderName,
      });
      if (response.status === 201) {
        setFolderCreated(true);
        navigate('/folders');
      } else {
        console.error('Failed to create folder');
      }
    } catch (error) {
      console.error('Error creating folder:', error);
    }
  };

  return (
    <div>
      <h1>Analyze and Write Features for Create Folder</h1>
      <p>
        This tool creates a new folder with the given name.
      </p>
      <input
        type="text"
        value={folderName}
        onChange={handleFolderNameChange}
        placeholder="Enter folder name"
      />
      <button onClick={handleCreateFolder}>Create Folder</button>
      {folderCreated && (
        <div>
          <h2>Folder Created</h2>
          <p>Folder Name: {folderName}</p>
        </div>
      )}
    </div>
  );
};

export default AnalyzeAndWriteFEComponent;