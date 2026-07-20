// src/components/analyze_and_write_fe_component.tsx

import React, { useState } from 'react';

interface Template {
  name: string;
  description: string;
}

interface Project {
  name: string;
  template: Template;
}

const templates: Template[] = [
  { name: 'React', description: 'A React project template' },
  { name: 'Node.js', description: 'A Node.js project template' },
];

const AnalyzeAndWriteFEComponent: React.FC = () => {
  const [projectName, setProjectName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [project, setProject] = useState<Project | null>(null);

  const handleProjectNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setProjectName(event.target.value);
  };

  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template);
  };

  const handleCreateProject = () => {
    if (projectName && selectedTemplate) {
      const newProject: Project = {
        name: projectName,
        template: selectedTemplate,
      };
      setProject(newProject);
    }
  };

  return (
    <div>
      <h1>Analyze and Write Features for TypeScript CLI Tool</h1>
      <p>
        This tool scaffolds new projects, supports multiple templates, and has
        interactive prompts.
      </p>
      <input
        type="text"
        value={projectName}
        onChange={handleProjectNameChange}
        placeholder="Enter project name"
      />
      <ul>
        {templates.map((template) => (
          <li key={template.name}>
            <input
              type="radio"
              checked={selectedTemplate === template}
              onChange={() => handleTemplateSelect(template)}
            />
            {template.name} - {template.description}
          </li>
        ))}
      </ul>
      <button onClick={handleCreateProject}>Create Project</button>
      {project && (
        <div>
          <h2>Project Created</h2>
          <p>Project Name: {project.name}</p>
          <p>Template: {project.template.name}</p>
        </div>
      )}
    </div>
  );
};

export default AnalyzeAndWriteFEComponent;